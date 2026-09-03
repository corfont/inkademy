import { forwardRef, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@inkademy/db";
import type { CreateSupportTicketInput } from "@inkademy/shared";
import { PRISMA } from "../../common/prisma/prisma.module";
import { NotificationService } from "../notification/notification.service";
import { ChatbotService } from "../chatbot/chatbot.service";
import { ChatbotDocumentsService } from "../chatbot/chatbot-documents.service";
import { SupportGateway } from "./support.gateway";

function isStaffRole(role?: string) {
  return role === "ADMIN" || role === "SUPPORT";
}

/** "Soporte" (staff humano), "Asistente IA" (mensaje autogenerado), o "Usuario" — para armar la conversación como texto plano que se le manda al asistente. */
function speakerLabel(m: { isAiGenerated?: boolean; author?: { globalRole?: string } | null }): string {
  if (m.isAiGenerated) return "Asistente IA";
  return isStaffRole(m.author?.globalRole) ? "Soporte" : "Usuario";
}

@Injectable()
export class SupportService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notifications: NotificationService,
    private readonly chatbot: ChatbotService,
    private readonly chatbotDocuments: ChatbotDocumentsService,
    @Inject(forwardRef(() => SupportGateway)) private readonly gateway: SupportGateway,
  ) {}

  async createTicket(userId: string, input: CreateSupportTicketInput) {
    const ticket = await this.prisma.supportTicket.create({
      data: {
        createdById: userId,
        category: input.category,
        subject: input.subject,
        priority: input.priority,
        messages: { create: { authorId: userId, body: input.body } },
      },
      include: { messages: true },
    });

    // "Si la IA puede resolver el caso lo debe hacer inmediatamente
    // ayudando al usuario, sino su estado quedará como pendiente" — intento
    // síncrono (sin cola): el alumno no debería esperar un cron para
    // recibir ayuda si la IA sí puede resolverlo ahora mismo. Si falla por
    // cualquier motivo, el ticket simplemente queda OPEN (pendiente),
    // exactamente el comportamiento de antes de esta función.
    const attempt = await this.chatbot.attemptAutoResolve({ subject: input.subject, category: input.category, message: input.body });
    if (attempt.resolved && attempt.reply) {
      const aiMessage = await this.prisma.supportMessage.create({ data: { ticketId: ticket.id, isAiGenerated: true, body: attempt.reply } });
      await this.prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: "WAITING_USER" } });
      this.gateway.emitNewMessage(ticket.id, aiMessage);
    }

    return ticket;
  }

  /** Contador para el indicador de "pendientes" al costado de Soporte en el menú del admin. */
  countPending() {
    return this.prisma.supportTicket.count({ where: { status: "OPEN" } });
  }

  // Solo los campos necesarios para mostrar "quién lo pidió" — evita filtrar
  // el resto del perfil (teléfono, dirección, fecha de nacimiento, etc.) que
  // `include: { createdBy: true }` habría traído completo.
  private readonly createdBySelect = { select: { displayName: true, firstName: true, lastName: true, email: true } } as const;

  private mapTicket<T extends { createdBy?: { displayName: string | null; firstName: string; lastName: string; email: string } }>(
    ticket: T,
  ) {
    const { createdBy, ...rest } = ticket;
    return {
      ...rest,
      createdByName: createdBy ? createdBy.displayName ?? `${createdBy.firstName} ${createdBy.lastName}` : undefined,
      createdByEmail: createdBy?.email,
    };
  }

  async listMine(userId: string, companyId?: string, isGlobalStaff = false) {
    if (companyId) {
      if (!isGlobalStaff) {
        const membership = await this.prisma.companyMembership.findUnique({
          where: { companyId_userId: { companyId, userId } },
        });
        if (!membership || membership.status !== "ACTIVE" || membership.role !== "COMPANY_ADMIN") {
          throw new ForbiddenException("Solo un COMPANY_ADMIN puede ver los tickets de la empresa");
        }
      }
      const tickets = await this.prisma.supportTicket.findMany({
        where: { companyId },
        orderBy: { updatedAt: "desc" },
        include: { messages: { orderBy: { createdAt: "desc" }, take: 1 }, createdBy: this.createdBySelect },
      });
      return tickets.map((t) => this.mapTicket(t));
    }
    // Antes esto SIEMPRE filtraba por createdById, incluso para ADMIN/SUPPORT
    // — /admin/soporte ("Todos los tickets") en realidad solo mostraba los
    // tickets que el propio admin hubiera creado él mismo, nunca los de un
    // alumno/docente/empresa real. Ahora el staff global ve todos.
    const tickets = await this.prisma.supportTicket.findMany({
      where: isGlobalStaff ? {} : { createdById: userId },
      orderBy: { updatedAt: "desc" },
      include: { messages: { orderBy: { createdAt: "desc" }, take: 1 }, createdBy: this.createdBySelect },
    });
    return tickets.map((t) => this.mapTicket(t));
  }

  // Campos seguros del autor de un mensaje — NUNCA `include: { author: true }`
  // en este archivo: eso trae el registro `User` completo, `passwordHash`
  // incluido, y en `getTicket()` ese objeto se devuelve tal cual al cliente
  // por REST (hallazgo de seguridad real: cualquiera que viera un ticket
  // —incluido el propio alumno que lo abrió— recibía el hash de contraseña
  // de todo el que hubiera escrito en el hilo, staff incluido).
  private readonly messageAuthorSelect = { select: { id: true, firstName: true, lastName: true, displayName: true, email: true, globalRole: true } } as const;

  async getTicket(userId: string, ticketId: string, isGlobalStaff: boolean) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: { messages: { orderBy: { createdAt: "asc" }, include: { author: this.messageAuthorSelect } } },
    });
    if (!ticket) throw new NotFoundException("Ticket no encontrado");

    if (!isGlobalStaff && ticket.createdById !== userId) {
      const membership = ticket.companyId
        ? await this.prisma.companyMembership.findUnique({
            where: { companyId_userId: { companyId: ticket.companyId, userId } },
          })
        : null;
      const isCompanyAdmin = membership?.status === "ACTIVE" && membership.role === "COMPANY_ADMIN";
      if (!isCompanyAdmin) throw new ForbiddenException("No puedes ver este ticket");
    }
    return ticket;
  }

  async addMessage(userId: string, ticketId: string, body: string, isGlobalStaff: boolean) {
    const ticket = await this.getTicket(userId, ticketId, isGlobalStaff);

    const message = await this.prisma.supportMessage.create({
      data: { ticketId, authorId: userId, body },
    });

    const isReplyFromStaff = isGlobalStaff && userId !== ticket.createdById;
    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: isReplyFromStaff ? "WAITING_USER" : "IN_PROGRESS" },
    });

    if (isReplyFromStaff) {
      const creator = await this.prisma.user.findUnique({ where: { id: ticket.createdById } });
      if (creator) await this.notifications.sendSupportTicketUpdate(creator.email, ticket.subject, creator.id, ticket.id);
    }

    // El email de notificación tarda (cola); el push por socket es
    // instantáneo — así quien tiene el ticket abierto ve la respuesta sin
    // esperar a que llegue el correo ni tener que refrescar la página.
    const messageWithAuthor = await this.prisma.supportMessage.findUnique({
      where: { id: message.id },
      include: { author: this.messageAuthorSelect },
    });
    this.gateway.emitNewMessage(ticketId, messageWithAuthor ?? message);

    return message;
  }

  /** Borrador de respuesta con IA para que soporte/admin lo revise antes de enviarlo. */
  async suggestReply(userId: string, ticketId: string, isGlobalStaff: boolean) {
    const ticket = await this.getTicket(userId, ticketId, isGlobalStaff);
    const conversation = ticket.messages.map((m) => `${speakerLabel(m)}: ${m.body}`).join("\n\n");
    return this.chatbot.draftReply({
      instructions: `Estás redactando una respuesta de soporte para el ticket "${ticket.subject}" (categoría: ${ticket.category}). Lee toda la conversación antes de responder al último mensaje del usuario.`,
      conversation,
    });
  }

  /**
   * Guarda el ticket completo (pregunta + la respuesta correcta que dio
   * soporte) como fuente de conocimiento del asistente de IA — para que la
   * próxima vez que a alguien le surja una duda parecida, el asistente ya
   * sepa cuál fue la respuesta correcta en vez de responder de forma
   * genérica. Solo tiene sentido para tickets con al menos una respuesta de
   * staff (si no, no hay "respuesta correcta" que guardar).
   */
  async saveAsKnowledge(ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: { messages: { orderBy: { createdAt: "asc" }, include: { author: this.messageAuthorSelect } } },
    });
    if (!ticket) throw new NotFoundException("Ticket no encontrado");
    if (!ticket.messages.some((m) => m.isAiGenerated || isStaffRole(m.author?.globalRole))) {
      throw new ForbiddenException("Este ticket todavía no tiene ninguna respuesta de soporte para guardar");
    }
    const conversation = ticket.messages.map((m) => `${speakerLabel(m)}: ${m.body}`).join("\n\n");
    const text = `Ticket de soporte: ${ticket.subject}\nCategoría: ${ticket.category}\n\n${conversation}`;
    return this.chatbotDocuments.createFromText(`Soporte: ${ticket.subject}`, text);
  }
}

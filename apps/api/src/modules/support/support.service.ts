import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@inkademy/db";
import type { CreateSupportTicketInput } from "@inkademy/shared";
import { PRISMA } from "../../common/prisma/prisma.module";
import { NotificationService } from "../notification/notification.service";

@Injectable()
export class SupportService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notifications: NotificationService,
  ) {}

  async createTicket(userId: string, input: CreateSupportTicketInput) {
    return this.prisma.supportTicket.create({
      data: {
        createdById: userId,
        category: input.category,
        subject: input.subject,
        priority: input.priority,
        messages: { create: { authorId: userId, body: input.body } },
      },
      include: { messages: true },
    });
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

  async getTicket(userId: string, ticketId: string, isGlobalStaff: boolean) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: { messages: { orderBy: { createdAt: "asc" }, include: { author: true } } },
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
      if (creator) await this.notifications.sendSupportTicketUpdate(creator.email, ticket.subject, creator.id);
    }

    return message;
  }
}

import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@inkademy/db";
import { PRISMA } from "../../common/prisma/prisma.module";
import { NotificationService } from "../notification/notification.service";
import { ChatbotService } from "../chatbot/chatbot.service";
import { ChatbotDocumentsService } from "../chatbot/chatbot-documents.service";

@Injectable()
export class SuggestionsService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notifications: NotificationService,
    private readonly chatbot: ChatbotService,
    private readonly chatbotDocuments: ChatbotDocumentsService,
  ) {}

  create(userId: string, message: string) {
    return this.prisma.courseSuggestion.create({ data: { userId, message } });
  }

  listMine(userId: string) {
    return this.prisma.courseSuggestion.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  }

  listAll() {
    return this.prisma.courseSuggestion.findMany({
      include: { user: true },
      orderBy: { createdAt: "desc" },
    });
  }

  updateStatus(id: string, status: string) {
    return this.prisma.courseSuggestion.update({ where: { id }, data: { status } });
  }

  private async findOrThrow(id: string) {
    const suggestion = await this.prisma.courseSuggestion.findUnique({ where: { id }, include: { user: true } });
    if (!suggestion) throw new NotFoundException("Sugerencia no encontrada");
    return suggestion;
  }

  /**
   * Guarda la respuesta del admin y se la envía por correo a quien mandó la
   * sugerencia — antes esto no existía, la única acción posible era cambiar
   * un estado interno que el usuario nunca veía.
   */
  async respond(id: string, adminId: string, response: string) {
    const suggestion = await this.findOrThrow(id);
    const updated = await this.prisma.courseSuggestion.update({
      where: { id },
      data: {
        adminResponse: response,
        respondedAt: new Date(),
        respondedById: adminId,
        status: suggestion.status === "NEW" ? "REVIEWED" : suggestion.status,
      },
    });
    await this.notifications.sendSuggestionResponse(suggestion.user.email, suggestion.message, response, suggestion.userId);
    return updated;
  }

  /** Borrador de respuesta con IA — el admin lo revisa/edita antes de enviarlo con `respond`. */
  async suggestReply(id: string) {
    const suggestion = await this.findOrThrow(id);
    return this.chatbot.draftReply({
      instructions:
        "El mensaje de abajo es una sugerencia de un usuario sobre un curso nuevo o una mejora que le gustaría ver en la plataforma (no es un problema técnico). Agradece la sugerencia y da una respuesta honesta y concreta sobre si se evaluará — sin prometer fechas ni resultados que no conoces.",
      conversation: suggestion.message,
    });
  }

  /**
   * Guarda la sugerencia y su respuesta ya enviada como fuente de
   * conocimiento del asistente de IA — así, si surge una duda parecida,
   * el asistente ya sabe cuál fue la respuesta correcta que dio el admin.
   */
  async saveAsKnowledge(id: string) {
    const suggestion = await this.findOrThrow(id);
    if (!suggestion.adminResponse) {
      throw new BadRequestException("Esta sugerencia todavía no tiene una respuesta guardada para usar como fuente");
    }
    const text = `Sugerencia de un usuario:\n${suggestion.message}\n\nRespuesta del equipo de Inkademy:\n${suggestion.adminResponse}`;
    return this.chatbotDocuments.createFromText(`Sugerencia: ${suggestion.message.slice(0, 60)}`, text);
  }
}

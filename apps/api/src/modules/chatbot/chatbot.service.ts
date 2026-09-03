import { Inject, Injectable, Logger } from "@nestjs/common";
import type { PrismaClient } from "@inkademy/db";
import { PRISMA } from "../../common/prisma/prisma.module";
import { callGeminiRaw, resolveGeminiConfig } from "../../common/ai/gemini-text.util";
import { ChatbotDocumentsService } from "./chatbot-documents.service";

const SETTINGS_ID = "default";

/**
 * Asistente de IA (widget flotante en el campus) — usa la API gratuita de
 * Google Gemini (Google AI Studio, https://aistudio.google.com/apikey).
 * La API key se resuelve primero desde ChatbotSettings (configurable en
 * /admin/asistente-ia) y si no hay fila o viene vacía, cae a
 * process.env.GEMINI_API_KEY — mismo patrón "DB primero, env de respaldo"
 * que SunatSettings/invoice.processor.ts.
 */
@Injectable()
export class ChatbotService {
  private readonly logger = new Logger(ChatbotService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly documents: ChatbotDocumentsService,
  ) {}

  async status() {
    const row = await this.prisma.chatbotSettings.findUnique({ where: { id: SETTINGS_ID } });
    const hasKey = Boolean(row?.apiKey) || Boolean(process.env.GEMINI_API_KEY);
    return { enabled: Boolean(row?.enabled) && hasKey };
  }

  async sendMessage(message: string, history: Array<{ role: "user" | "assistant"; content: string }> = []) {
    const basePrompt =
      (await resolveGeminiConfig(this.prisma)).row.systemPrompt ||
      "Eres el asistente virtual de Inkademy, una plataforma peruana de cursos y capacitación online. Responde en español, de forma breve y cordial, y si no sabes algo específico de la cuenta del usuario, sugiere contactar a soporte desde /campus/soporte.";

    // Documentos que el admin subió (p.ej. el manual de ayuda, o tickets de
    // soporte/sugerencias ya resueltos guardados como fuente — ver
    // ChatbotDocumentsService.createFromText) — si hay alguno activo, se le
    // agregan como fuente de información al prompt para que las respuestas
    // dejen de ser genéricas y usen ese contenido real.
    const contextText = await this.documents.getActiveContextText();
    const systemPrompt = contextText
      ? `${basePrompt}\n\nUsa la siguiente información de referencia para responder cuando sea relevante — si la pregunta no tiene que ver con esto, respóndela igual con tu conocimiento general:\n${contextText}`
      : basePrompt;

    // Últimos 10 turnos alcanzan para dar contexto sin inflar la petición.
    const recentHistory = history.slice(-10);
    const contents = [
      ...recentHistory.map((turn) => ({
        role: turn.role === "assistant" ? "model" : "user",
        parts: [{ text: turn.content }],
      })),
      { role: "user", parts: [{ text: message }] },
    ];

    const reply = await callGeminiRaw(this.prisma, systemPrompt, contents);
    return { reply };
  }

  /**
   * Borrador de respuesta para que el admin revise/edite antes de enviarlo
   * — usado desde /admin/soporte/:id y /admin/sugerencias (ver
   * SupportController.suggestReply / SuggestionsController.suggestReply).
   * Reutiliza la misma base de conocimiento (documentos activos, que
   * incluye tickets/sugerencias ya resueltos) que el chat del alumno, así
   * que si una duda similar ya se respondió bien antes, el borrador la usa.
   */
  async draftReply(input: { instructions: string; conversation: string }): Promise<{ draft: string }> {
    const contextText = await this.documents.getActiveContextText();
    const systemPrompt = [
      "Eres el equipo de soporte/administración de Inkademy, una plataforma peruana de cursos y capacitación online.",
      "Redacta en español un borrador de respuesta profesional, breve, cordial y concreto para la persona que escribió el mensaje de abajo.",
      "No inventes datos que no tengas (precios, fechas, políticas) — si no los sabes, dilo con honestidad en vez de inventarlos.",
      "Devuelve SOLO el texto de la respuesta, sin encabezados ni explicaciones sobre lo que estás haciendo.",
      input.instructions,
      contextText ? `\nInformación de referencia (usa esto si es relevante):\n${contextText}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const reply = await callGeminiRaw(this.prisma, systemPrompt, [{ role: "user", parts: [{ text: input.conversation }] }]);
    return { draft: reply };
  }

  /**
   * "Si la IA puede resolver el caso lo debe hacer inmediatamente ayudando
   * al usuario, sino su estado quedará como pendiente" — a diferencia de
   * draftReply/sendMessage, esto NUNCA lanza: si el asistente está apagado,
   * sin API key, o Gemini falla, simplemente se considera "no resuelto" y
   * el ticket queda pendiente para soporte humano (comportamiento anterior
   * a esta función).
   */
  async attemptAutoResolve(input: { subject: string; category: string; message: string }): Promise<{ resolved: boolean; reply?: string }> {
    const NO_RESOLVE = "NO_PUEDO_RESOLVER";
    try {
      const row = await this.prisma.chatbotSettings.findUnique({ where: { id: SETTINGS_ID } });
      if (!row?.enabled || !(row.apiKey || process.env.GEMINI_API_KEY)) return { resolved: false };

      const contextText = await this.documents.getActiveContextText();
      const systemPrompt = [
        "Eres soporte de Inkademy, una plataforma peruana de cursos y capacitación online.",
        `Se abrió un ticket de soporte — categoría "${input.category}", asunto "${input.subject}".`,
        "Si puedes responder la consulta del alumno de forma completa y confiable usando la información de referencia de abajo (o conocimiento general seguro sobre cómo usar la plataforma), redacta una respuesta breve, cordial y concreta — SOLO el texto de la respuesta.",
        `Si NO tienes información suficiente para resolverlo con confianza, o el caso requiere que un humano intervenga (reembolsos, quejas, algo específico de la cuenta del alumno que no puedes ver), responde ÚNICAMENTE con el texto exacto: ${NO_RESOLVE}`,
        contextText ? `\nInformación de referencia:\n${contextText}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      const reply = await callGeminiRaw(this.prisma, systemPrompt, [{ role: "user", parts: [{ text: input.message }] }]);
      if (!reply.trim() || reply.includes(NO_RESOLVE)) return { resolved: false };
      return { resolved: true, reply: reply.trim() };
    } catch (err) {
      this.logger.warn(`No se pudo intentar auto-resolver el ticket: ${(err as Error).message}`);
      return { resolved: false };
    }
  }
}

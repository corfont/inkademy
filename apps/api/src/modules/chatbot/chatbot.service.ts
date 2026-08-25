import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import type { PrismaClient } from "@inkademy/db";
import { PRISMA } from "../../common/prisma/prisma.module";
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
    const row = await this.prisma.chatbotSettings.findUnique({ where: { id: SETTINGS_ID } });
    if (!row?.enabled) {
      throw new BadRequestException("El asistente de IA no está habilitado. Actívalo desde /admin/asistente-ia.");
    }
    const apiKey = row.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new BadRequestException("Falta configurar la API key del asistente en /admin/asistente-ia.");
    }
    const model = row.model || "gemini-2.5-flash";
    const basePrompt =
      row.systemPrompt ||
      "Eres el asistente virtual de Inkademy, una plataforma peruana de cursos y capacitación online. Responde en español, de forma breve y cordial, y si no sabes algo específico de la cuenta del usuario, sugiere contactar a soporte desde /campus/soporte.";

    // Documentos que el admin subió (p.ej. el manual de ayuda) — si hay
    // alguno activo, se le agregan como fuente de información al prompt
    // para que las respuestas dejen de ser genéricas y usen ese contenido
    // real. Antes el asistente no tenía ninguna fuente propia.
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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { maxOutputTokens: 512, temperature: 0.4 },
        }),
      });
    } catch (err) {
      this.logger.error(`No se pudo contactar a Gemini: ${(err as Error).message}`);
      throw new BadRequestException("No pudimos contactar al asistente de IA. Intenta de nuevo en un momento.");
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      this.logger.warn(`Gemini respondió ${response.status}: ${body.slice(0, 500)}`);
      // 400 con API key inválida es el caso más común al recién configurar —
      // mensaje explícito en vez de un genérico "algo salió mal".
      if (response.status === 400 || response.status === 403) {
        throw new BadRequestException(
          "El asistente de IA rechazó la solicitud — probablemente la API key configurada en /admin/asistente-ia no es válida. Genera una nueva en https://aistudio.google.com/apikey.",
        );
      }
      throw new BadRequestException("El asistente de IA no pudo responder en este momento.");
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const reply = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!reply.trim()) {
      throw new BadRequestException("El asistente no generó una respuesta. Intenta reformular tu pregunta.");
    }
    return { reply: reply.trim() };
  }
}

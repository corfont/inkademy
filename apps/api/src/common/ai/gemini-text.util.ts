import { BadRequestException, Logger } from "@nestjs/common";
import type { PrismaClient } from "@inkademy/db";

const logger = new Logger("gemini-text.util");
const SETTINGS_ID = "default";

/**
 * "Muchas features de IA propuestas... implementalas" — antes de esto,
 * `ChatbotService.callGemini` (apps/api/src/modules/chatbot/chatbot.service.ts)
 * era el único cliente Gemini síncrono de apps/api, privado a ese service —
 * cada feature nueva que necesitara llamar a Gemini desde una request HTTP
 * (corrección asistida, generación de preguntas, resumen ejecutivo,
 * traducción) hubiera tenido que duplicarlo otra vez. Se extrae acá,
 * ChatbotService pasa a delegar en este módulo (mismo comportamiento, ver
 * comentario ahí). Nota: esto es DISTINTO de apps/worker/src/lib/gemini.ts
 * (asíncrono, desde jobs de BullMQ) — esa duplicación sí es deliberada
 * (apps/api y apps/worker son deployables separados); esta no lo era.
 */
export async function resolveGeminiConfig(prisma: PrismaClient) {
  const row = await prisma.chatbotSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (!row?.enabled) {
    throw new BadRequestException("El asistente de IA no está habilitado. Actívalo desde /admin/asistente-ia.");
  }
  const apiKey = row.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new BadRequestException("Falta configurar la API key del asistente en /admin/asistente-ia.");
  }
  return { row, apiKey, model: row.model || "gemini-2.5-flash" };
}

export async function callGeminiRaw(
  prisma: PrismaClient,
  systemPrompt: string,
  contents: Array<{ role: string; parts: Array<{ text: string }> }>,
  opts?: { maxOutputTokens?: number; temperature?: number; thinkingBudget?: number },
): Promise<string> {
  const { apiKey, model } = await resolveGeminiConfig(prisma);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          maxOutputTokens: opts?.maxOutputTokens ?? 512,
          temperature: opts?.temperature ?? 0.4,
          // gemini-2.5-flash reserva parte de maxOutputTokens para "pensar"
          // internamente antes de responder — el gasto es MUY variable
          // (confirmado en vivo: 166 a 604 tokens para el mismo prompt) y
          // competía con el texto visible, cortándolo a mitad de palabra en
          // tareas cortas (resumen ejecutivo, traducción, feedback de
          // examen) que no necesitan razonamiento en cadena. Desactivado
          // por defecto — un caller futuro que sí lo necesite puede pasar
          // thinkingBudget explícito.
          thinkingConfig: { thinkingBudget: opts?.thinkingBudget ?? 0 },
        },
      }),
    });
  } catch (err) {
    logger.error(`No se pudo contactar a Gemini: ${(err as Error).message}`);
    throw new BadRequestException("No pudimos contactar al asistente de IA. Intenta de nuevo en un momento.");
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    logger.warn(`Gemini respondió ${response.status}: ${body.slice(0, 500)}`);
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
  return reply.trim();
}

/** Wrapper de un solo turno — la forma más común para las features nuevas (no conversación, un prompt + un texto). */
export async function callGeminiOnce(
  prisma: PrismaClient,
  systemPrompt: string,
  userText: string,
  opts?: { maxOutputTokens?: number; temperature?: number },
): Promise<string> {
  return callGeminiRaw(prisma, systemPrompt, [{ role: "user", parts: [{ text: userText }] }], opts);
}

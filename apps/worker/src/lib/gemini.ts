// Llamada mínima a Gemini duplicada del lado del worker — mismo patrón ya
// usado para SUNAT (apps/worker/src/lib/sunat/config.ts): la lógica "de
// negocio" del asistente vive en apps/api (ChatbotService), pero un job
// retrasado (BullMQ delay) que debe correr sin que nadie esté navegando la
// API en ese momento necesita poder llamar a Gemini por su cuenta, leyendo
// la misma fila ChatbotSettings/ChatbotDocument que ya usa la API.
import { prisma } from "@inkademy/db";
import { createLogger } from "./logger";

const logger = createLogger("gemini");
const SETTINGS_ID = "default";
const MAX_CONTEXT_CHARS = 12000;

export async function getActiveChatbotContextText(): Promise<string> {
  const docs = await prisma.chatbotDocument.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
  if (docs.length === 0) return "";
  let combined = "";
  for (const doc of docs) {
    const chunk = `\n\n--- ${doc.title} ---\n${doc.extractedText}`;
    if (combined.length + chunk.length > MAX_CONTEXT_CHARS) {
      combined += chunk.slice(0, MAX_CONTEXT_CHARS - combined.length);
      break;
    }
    combined += chunk;
  }
  return combined;
}

/** Devuelve null si el asistente no está habilitado o no hay API key — el llamador decide qué hacer (típicamente: no auto-responder, dejar en manos de un humano). */
export async function callGeminiIfEnabled(systemPrompt: string, userMessage: string): Promise<string | null> {
  const settings = await prisma.chatbotSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (!settings?.enabled) return null;
  const apiKey = settings.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const model = settings.model || "gemini-2.5-flash";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { maxOutputTokens: 512, temperature: 0.4 },
      }),
    });
    if (!response.ok) {
      logger.warn("Gemini respondió con error", { status: response.status });
      return null;
    }
    const data = (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const reply = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return reply.trim() || null;
  } catch (err) {
    logger.error("no se pudo contactar a Gemini", { err: String(err) });
    return null;
  }
}

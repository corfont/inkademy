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
        // thinkingBudget:0 — mismo hallazgo que en apps/api/src/common/ai/
        // gemini-text.util.ts: gemini-2.5-flash reserva parte de
        // maxOutputTokens para "pensar" antes de responder, con gasto MUY
        // variable (confirmado en vivo: entre 166 y 604 tokens para el
        // mismo prompt) — sin esto, el JSON estricto que piden draftWithAI/
        // draftReengagement salía cortado a mitad y fallaba el parseo
        // ("la IA no devolvió JSON válido"), confirmado en vivo también.
        generationConfig: { maxOutputTokens: 512, temperature: 0.4, thinkingConfig: { thinkingBudget: 0 } },
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

// ---------------------------------------------------------------------------
// Transcripción de video a WebVTT (subtítulos, Fase 2) — a diferencia de
// callGeminiIfEnabled (texto plano inline, y respeta el toggle "enabled" del
// widget del asistente), esto sube un archivo real a la Files API de Gemini
// y es una acción explícita que el admin dispara a mano (ver
// AdminService.generateLessonSubtitles) — no tiene sentido bloquearla por el
// toggle "enabled" del chatbot, que es sobre otra feature (el widget
// flotante), así que solo exige que exista una API key.
// ---------------------------------------------------------------------------

interface GeminiFile {
  name: string;
  uri: string;
  state: string;
  mimeType: string;
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

async function resolveApiKey(): Promise<string> {
  const row = await prisma.chatbotSettings.findUnique({ where: { id: SETTINGS_ID } });
  const apiKey = row?.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("No hay una clave de Gemini configurada (ChatbotSettings.apiKey ni GEMINI_API_KEY)");
  return apiKey;
}

/**
 * Sube un archivo a la Files API de Gemini con el protocolo "resumable" de
 * dos pasos (start + upload) — es lo que exige Gemini para archivos de
 * video/audio, a diferencia del texto plano de callGeminiIfEnabled (ese va
 * inline en el body de generateContent, sin subir nada).
 */
async function uploadToGemini(apiKey: string, bytes: Buffer, mimeType: string, displayName: string): Promise<GeminiFile> {
  const startRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.length),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });
  if (!startRes.ok) throw new Error(`Gemini rechazó el inicio de la subida: HTTP ${startRes.status} ${await startRes.text()}`);
  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini no devolvió una URL de subida");

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(bytes.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: bytes,
  });
  if (!uploadRes.ok) throw new Error(`Gemini rechazó la subida del archivo: HTTP ${uploadRes.status} ${await uploadRes.text()}`);
  const body = (await uploadRes.json()) as { file: GeminiFile };
  return body.file;
}

/** Gemini procesa video/audio de forma asíncrona (state=PROCESSING) antes de poder usarlo en generateContent. */
async function waitUntilActive(apiKey: string, fileName: string, maxAttempts = 60): Promise<{ uri: string; mimeType: string }> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`);
    if (!res.ok) throw new Error(`No se pudo consultar el estado del archivo en Gemini: HTTP ${res.status}`);
    const file = (await res.json()) as GeminiFile;
    if (file.state === "ACTIVE") return { uri: file.uri, mimeType: file.mimeType };
    if (file.state === "FAILED") throw new Error("Gemini no pudo procesar el archivo de video/audio");
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("Gemini tardó demasiado en procesar el archivo (timeout)");
}

const VTT_HEADER = "WEBVTT";

/** Limpia bloques de código markdown (```vtt ... ```) por si el modelo los agrega, aunque el prompt pide que no lo haga. */
function cleanVttResponse(text: string): string {
  const withoutFences = text
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/```$/i, "")
    .trim();
  if (withoutFences.startsWith(VTT_HEADER)) return withoutFences;
  // Si el modelo no puso el encabezado (raro, pero posible), se antepone —
  // sin esto ningún <track> lo reconocería como WebVTT válido.
  return `${VTT_HEADER}\n\n${withoutFences}`;
}

/**
 * Transcribe el audio de un video a WebVTT usando Gemini — sube el video,
 * espera a que lo procese, y le pide la transcripción con marcas de tiempo
 * reales (no aproximadas: Gemini "escucha" el archivo, no adivina).
 */
export async function transcribeVideoToVtt(videoBytes: Buffer, mimeType: string, displayName: string, language = "es"): Promise<string> {
  const apiKey = await resolveApiKey();
  logger.info("subiendo video a Gemini", { displayName, sizeBytes: videoBytes.length });
  const uploaded = await uploadToGemini(apiKey, videoBytes, mimeType, displayName);
  const active = await waitUntilActive(apiKey, uploaded.name);
  logger.info("video activo en Gemini, generando transcripción", { displayName });

  const langName = language === "en" ? "inglés" : "español";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { fileData: { mimeType: active.mimeType, fileUri: active.uri } },
            {
              text: `Transcribe el audio de este video en ${langName}, en formato WebVTT válido (con encabezado WEBVTT y marcas de tiempo reales del video). Responde SOLO con el contenido WebVTT — sin explicaciones, sin bloques de código markdown, sin nada antes o después.`,
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Gemini rechazó la generación de la transcripción: HTTP ${res.status} ${await res.text()}`);
  const body = (await res.json()) as GeminiGenerateContentResponse;
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`Gemini no devolvió texto de transcripción: ${JSON.stringify(body)}`);
  return cleanVttResponse(text);
}

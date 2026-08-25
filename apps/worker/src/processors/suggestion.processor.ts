import type { Job } from "bullmq";
import { prisma } from "@inkademy/db";
import type { SuggestionAutoRespondJobData } from "../queues";
import { getActiveChatbotContextText, callGeminiIfEnabled } from "../lib/gemini";
import { notifyByEmail } from "../lib/notify";
import { createLogger } from "../lib/logger";

const logger = createLogger("suggestion.processor");

/**
 * Job retrasado (delay = ChatbotSettings.suggestionAutoRespondDelayMinutes,
 * encolado por SuggestionsService.create en apps/api). A propósito NO es
 * inmediato — "si le llega inmediato al usuario, va a darse cuenta que es
 * una IA y no una persona que ha escrito".
 */
export async function processSuggestionAutoRespondJob(job: Job<SuggestionAutoRespondJobData>): Promise<void> {
  const { suggestionId } = job.data;
  const suggestion = await prisma.courseSuggestion.findUnique({ where: { id: suggestionId }, include: { user: true } });
  if (!suggestion) {
    logger.warn("sugerencia no encontrada, se descarta el job", { suggestionId });
    return;
  }
  // El admin ya la respondió a mano (o cambió su estado) antes de que se
  // cumpliera el plazo — la auto-respuesta ya no aplica, se respeta lo que
  // hizo el humano.
  if (suggestion.adminResponse) {
    logger.info("la sugerencia ya tiene respuesta, se omite la auto-respuesta", { suggestionId });
    return;
  }
  // Puede haberse desactivado el auto-respond después de encolar el job.
  const settings = await prisma.chatbotSettings.findUnique({ where: { id: "default" } });
  if (!settings?.suggestionAutoRespond) {
    logger.info("auto-respond de sugerencias desactivado, se omite", { suggestionId });
    return;
  }

  const contextText = await getActiveChatbotContextText();
  const systemPrompt = [
    "Eres el equipo de Inkademy, una plataforma peruana de cursos y capacitación online.",
    "El mensaje de abajo es una sugerencia de un usuario sobre un curso nuevo o una mejora — no es un problema técnico.",
    "Agradece la sugerencia y da una respuesta honesta y concreta sobre si se evaluará, sin prometer fechas ni resultados que no conoces.",
    "Devuelve SOLO el texto de la respuesta, sin encabezados.",
    contextText ? `\nInformación de referencia:\n${contextText}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const reply = await callGeminiIfEnabled(systemPrompt, suggestion.message);
  if (!reply) {
    logger.warn("el asistente no pudo generar una respuesta, la sugerencia queda pendiente para un admin", { suggestionId });
    return;
  }

  await prisma.courseSuggestion.update({
    where: { id: suggestionId },
    data: { adminResponse: reply, respondedAt: new Date(), respondedByAi: true, status: suggestion.status === "NEW" ? "REVIEWED" : suggestion.status },
  });

  await notifyByEmail({
    userId: suggestion.userId,
    to: suggestion.user.email,
    template: "email.suggestion-auto-response", // solo una etiqueta (Notification.template + nombre de job en la cola "email") — el processor de email envía el html tal cual, sin mirar el nombre
    subject: "Respuesta a tu sugerencia en Inkademy",
    html: `<p>Gracias por tu sugerencia:</p><blockquote>${suggestion.message}</blockquote><p>${reply}</p>`,
  });

  logger.info("sugerencia respondida automáticamente por IA", { suggestionId });
}

import type { Job } from "bullmq";
import { prisma } from "@inkademy/db";
import type { ExpireAttemptJobData } from "../queues";
import { createLogger } from "../lib/logger";

const logger = createLogger("assessment-expiry.processor");

/**
 * "Si un alumno simplemente abandona [el examen], pero si el tiempo
 * concluye cambia su estado a culminado — tiene que haber una expiración
 * automática en función a la duración del examen." Job retrasado
 * (delay = timeLimitMinutes + margen, encolado por
 * AssessmentService.createAttempt en apps/api al empezar el intento).
 *
 * Si para cuando se dispara el intento YA se envió (normal o por
 * timeout), no hace nada — solo actúa sobre un intento que sigue
 * IN_PROGRESS de verdad. No hay respuestas que calificar (solo se guardan
 * al enviar, ver AssessmentService.submitAttempt): se cierra directo en
 * FAILED, sin pasar por el pipeline normal de corrección.
 */
export async function processExpireAttemptJob(job: Job<ExpireAttemptJobData>): Promise<void> {
  const { attemptId } = job.data;
  const attempt = await prisma.assessmentAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt) {
    logger.warn("intento no encontrado, se descarta el job", { attemptId });
    return;
  }
  if (attempt.status !== "IN_PROGRESS") {
    logger.info("el intento ya se había enviado, se omite la expiración automática", { attemptId, status: attempt.status });
    return;
  }

  const now = new Date();
  const durationSeconds = Math.max(0, Math.round((now.getTime() - attempt.startedAt.getTime()) / 1000));
  await prisma.assessmentAttempt.update({
    where: { id: attemptId },
    data: { status: "FAILED", submittedAt: now, durationSeconds, timedOut: true },
  });

  logger.info("intento abandonado cerrado automáticamente por expiración de tiempo", { attemptId, durationSeconds });
}

import type { Job } from "bullmq";
import { prisma } from "@inkademy/db";
import type { EmailJobPayload } from "../queues";
import { sendMail } from "../lib/mailer";
import { createLogger } from "../lib/logger";

const logger = createLogger("email.processor");

/**
 * Envía el correo (ya viene con `subject`/`html` renderizados — sea porque
 * lo encoló `apps/api` vía `NotificationService`, o porque lo encoló el
 * propio worker en `reminder`/`attendance-sync`/`recommendation`
 * processors) y, en la medida de lo posible, actualiza el `Notification`
 * correspondiente a `SENT`/`FAILED`.
 *
 * Nota sobre esa actualización: cuando `apps/api` encola el job no incluye
 * un `notificationId` en el payload (solo `to/subject/html/text/meta`), así
 * que no hay forma 100% confiable de saber cuál fila `Notification` le
 * corresponde. Se hace un best-effort (buscar la más reciente en estado
 * PENDING para ese `template`+usuario) y si no se encuentra ninguna, no es
 * un error — el correo se envía igual. Cuando el worker mismo es quien
 * encola (recordatorios, inasistencia, recomendación), sí mete
 * `meta.notificationId` y la actualización es exacta.
 */
export async function processEmailJob(job: Job<EmailJobPayload>): Promise<void> {
  const { to, subject, html, text, meta, attachments } = job.data;

  if (!to) {
    logger.warn("job de email sin destinatario, se descarta", { jobId: job.id, jobName: job.name });
    return;
  }

  const notificationId = typeof meta?.notificationId === "string" ? meta.notificationId : undefined;

  try {
    await sendMail({ to, subject, html, text, attachments });
    await markNotification(job.name, to, notificationId, "SENT", { attempts: job.attemptsMade + 1 });
  } catch (err) {
    logger.error("fallo al enviar email", { jobId: job.id, jobName: job.name, to, err: String(err) });
    // «Fallido» solo cuando se agotaron los reintentos; mientras queden, sigue pendiente (con el motivo del último intento).
    const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await markNotification(job.name, to, notificationId, isLastAttempt ? "FAILED" : "PENDING", {
      attempts: job.attemptsMade + 1,
      errorMessage: (err instanceof Error ? err.message : String(err)).slice(0, 500),
    });
    throw err; // deja que BullMQ reintente según su política de backoff
  }
}

async function markNotification(
  template: string,
  to: string,
  notificationId: string | undefined,
  status: "SENT" | "FAILED" | "PENDING",
  trace: { attempts?: number; errorMessage?: string } = {},
): Promise<void> {
  const traceData = { attempts: trace.attempts, errorMessage: status === "SENT" ? null : trace.errorMessage };
  try {
    if (notificationId) {
      await prisma.notification.update({
        where: { id: notificationId },
        data: { status, sentAt: status === "SENT" ? new Date() : undefined, ...traceData },
      });
      return;
    }

    // Best-effort: la notificación la creó apps/api sin pasar su id en el job.
    const user = await prisma.user.findUnique({ where: { email: to } });
    if (!user) return;
    const pending = await prisma.notification.findFirst({
      where: { userId: user.id, channel: "EMAIL", template, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
    if (!pending) return;
    await prisma.notification.update({
      where: { id: pending.id },
      data: { status, sentAt: status === "SENT" ? new Date() : undefined, ...traceData },
    });
  } catch (err) {
    // Nunca tirar el job por no poder actualizar el registro de trazabilidad.
    logger.warn("no se pudo actualizar Notification (no crítico)", { template, to, err: String(err) });
  }
}

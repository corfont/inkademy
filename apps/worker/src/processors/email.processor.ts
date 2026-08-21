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
  const { to, subject, html, text, meta } = job.data;

  if (!to) {
    logger.warn("job de email sin destinatario, se descarta", { jobId: job.id, jobName: job.name });
    return;
  }

  const notificationId = typeof meta?.notificationId === "string" ? meta.notificationId : undefined;

  try {
    await sendMail({ to, subject, html, text });
    await markNotification(job.name, to, notificationId, "SENT");
  } catch (err) {
    logger.error("fallo al enviar email", { jobId: job.id, jobName: job.name, to, err: String(err) });
    await markNotification(job.name, to, notificationId, "FAILED");
    throw err; // deja que BullMQ reintente según su política de backoff
  }
}

async function markNotification(
  template: string,
  to: string,
  notificationId: string | undefined,
  status: "SENT" | "FAILED",
): Promise<void> {
  try {
    if (notificationId) {
      await prisma.notification.update({
        where: { id: notificationId },
        data: { status, sentAt: status === "SENT" ? new Date() : undefined },
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
      data: { status, sentAt: status === "SENT" ? new Date() : undefined },
    });
  } catch (err) {
    // Nunca tirar el job por no poder actualizar el registro de trazabilidad.
    logger.warn("no se pudo actualizar Notification (no crítico)", { template, to, err: String(err) });
  }
}

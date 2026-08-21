import { prisma } from "@inkademy/db";
import { emailQueue } from "./queue-client";

export interface NotifyByEmailInput {
  userId: string;
  to: string;
  /** Job name en la cola "email" (uno de WORKER_EMAIL_JOBS) — también se
   * guarda como `Notification.template`. */
  template: string;
  subject: string;
  html: string;
  text?: string;
  /** jobId determinístico opcional, para que reintentar el sweep no duplique el envío. */
  jobId?: string;
  /** delay en ms (BullMQ) si el envío debe programarse para el futuro. */
  delay?: number;
}

/**
 * Crea la fila `Notification` (trazabilidad / bandeja in-app) y encola el
 * envío en la cola "email", metiendo `notificationId` en `meta` para que
 * `email.processor.ts` la pueda actualizar a SENT/FAILED sin adivinar.
 * Usado por los processors que el worker produce para sí mismo
 * (reminder, attendance-sync, recommendation) — los correos que ya envía
 * `apps/api` directamente no pasan por aquí.
 */
export async function notifyByEmail(input: NotifyByEmailInput): Promise<void> {
  const notification = await prisma.notification.create({
    data: { userId: input.userId, channel: "EMAIL", template: input.template, status: "PENDING" },
  });

  await emailQueue().add(
    input.template,
    {
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      meta: { userId: input.userId, notificationId: notification.id },
    },
    {
      jobId: input.jobId,
      delay: input.delay,
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
}

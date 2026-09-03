import { prisma } from "@inkademy/db";
import type { NotificationType } from "@inkademy/db";
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

export interface NotifyInAppInput {
  userId: string;
  type: NotificationType;
  template: string;
  title: string;
  body?: string;
  url?: string;
}

/** Crea la fila `Notification` para la bandeja in-app (campana del layout) — sin cola de por medio, es solo un INSERT. */
export async function notifyInApp(input: NotifyInAppInput): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: input.userId,
      channel: "IN_APP",
      template: input.template,
      type: input.type,
      title: input.title,
      body: input.body,
      url: input.url,
      status: "SENT",
      sentAt: new Date(),
    },
  });
}

type NotificationSettingsRow = Awaited<ReturnType<typeof prisma.notificationSettings.findUnique>>;

// Se consulta en cada sweep (cada pocos minutos) y en cada envío puntual —
// cachear 60s en memoria del proceso evita pegarle a Postgres en cada
// notificación individual de un sweep con muchos destinatarios, sin
// arriesgar que un cambio desde /admin/notificaciones tarde más de 1
// minuto en aplicar (no es una config de seguridad, un minuto de retraso
// es aceptable).
let settingsCache: { row: NotificationSettingsRow; expiresAt: number } | null = null;

async function getNotificationSettingsCached(): Promise<NonNullable<NotificationSettingsRow>> {
  if (settingsCache && settingsCache.expiresAt > Date.now() && settingsCache.row) {
    return settingsCache.row;
  }
  const row = await prisma.notificationSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
  settingsCache = { row, expiresAt: Date.now() + 60_000 };
  return row;
}

/**
 * Punto único que decide, por tipo de notificación, si mandar correo y/o
 * crear la fila in-app — según lo configurado en /admin/notificaciones
 * (NotificationSettings). Los campos de esa tabla siguen el patrón fijo
 * `${tipoEnCamelCase}Email` / `${tipoEnCamelCase}InApp` (ver
 * notification-type-key.ts para el mapeo NotificationType -> ese prefijo).
 */
export async function notifyUser(input: {
  userId: string;
  type: NotificationType;
  email?: Omit<NotifyByEmailInput, "userId">;
  inApp?: Omit<NotifyInAppInput, "userId" | "type">;
}): Promise<void> {
  const settings = await getNotificationSettingsCached();
  const key = notificationTypeSettingsKey(input.type);
  const emailOn = key ? Boolean((settings as unknown as Record<string, boolean>)[`${key}Email`] ?? true) : true;
  const inAppOn = key ? Boolean((settings as unknown as Record<string, boolean>)[`${key}InApp`] ?? true) : true;

  if (emailOn && input.email) await notifyByEmail({ userId: input.userId, ...input.email });
  if (inAppOn && input.inApp) await notifyInApp({ userId: input.userId, type: input.type, ...input.inApp });
}

/**
 * Mapea cada NotificationType al prefijo camelCase de sus 2 columnas en
 * NotificationSettings (`xxxEmail`/`xxxInApp`). GENERIC no tiene fila de
 * configuración (siempre se envía) — se usa para avisos puntuales sin tipo
 * específico, fuera del alcance de "todo configurable".
 */
function notificationTypeSettingsKey(type: NotificationType): string | null {
  const map: Partial<Record<NotificationType, string>> = {
    COURSE_ACCESS_EXPIRING: "courseAccessExpiring",
    LIVE_SESSION_UPCOMING: "liveSessionUpcoming",
    ASSESSMENT_DUE: "assessmentDue",
    PARTNERSHIP_EXPIRING: "partnershipExpiring",
    SUPPORT_TICKET_UPDATE: "supportTicketUpdate",
    SUGGESTION_UNANSWERED: "suggestionUnanswered",
    PLATFORM_LICENSE_EXPIRING: "platformLicenseExpiring",
  };
  return map[type] ?? null;
}

/** Exportado para que los sweeps de reminder.processor.ts lean partnershipExpiringLeadDays/suggestionUnansweredAfterHours/platformLicenseExpiringLeadDays sin otra query. */
export async function getNotificationSettings(): Promise<NonNullable<NotificationSettingsRow>> {
  return getNotificationSettingsCached();
}

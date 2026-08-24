// ============================================================================
// Nombres de cola y de job BullMQ.
//
// Las 5 colas y sus nombres EXACTOS están definidos por apps/api en
// apps/api/src/common/queues/queue.constants.ts (ese archivo dice, con
// razón, que el worker debe usar los mismos nombres — así que se
// **mirror-ean** aquí en vez de inventarse). Si algo cambia del lado de
// apps/api, hay que actualizar esto también. Ver
// apps/worker/IMPLEMENTATION-NOTES.md sección 1 para el detalle completo de
// qué se confirmó contra el código real de apps/api y qué quedó como
// decisión propia del worker (p.ej. `reminder.sweep`, que apps/api no
// conoce ni necesita conocer: es un detalle interno de cómo el worker se
// autoprograma).
// ============================================================================

export const QUEUE_NAMES = {
  EMAIL: "email",
  CERTIFICATE: "certificate",
  REMINDER: "reminder",
  ATTENDANCE_SYNC: "attendance-sync",
  RECOMMENDATION: "recommendation",
  INVOICE: "invoice",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ---------------------------------------------------------------------------
// Cola "email" — mirror de apps/api/src/common/queues/queue.constants.ts
// (EMAIL_JOBS). apps/api encola estos 8 jobs ya con el HTML renderizado
// (ver notification.service.ts): el worker solo tiene que enviarlos por
// SMTP, no renderizarlos.
// ---------------------------------------------------------------------------
export const EMAIL_JOBS = {
  WELCOME: "email.welcome",
  VERIFY_EMAIL: "email.verify-email",
  FORGOT_PASSWORD: "email.forgot-password",
  RECEIPT: "email.receipt",
  COMPANY_INVITE: "email.company-invite",
  CERTIFICATE_READY: "email.certificate-ready",
  SUPPORT_TICKET_UPDATE: "email.support-ticket-update",
  GENERIC: "email.generic",
} as const;

/**
 * Jobs de la cola "email" que **el propio worker** produce y consume (no
 * los encola apps/api porque son sobre eventos que solo el worker conoce:
 * horarios de clases en vivo, vencimientos, inasistencia, recomendaciones).
 * Se mantienen en el mismo namespace `email.*` que usa apps/api por
 * consistencia, con el mismo shape `EmailJobPayload` — ver
 * `src/processors/email.processor.ts`.
 */
export const WORKER_EMAIL_JOBS = {
  LIVE_SESSION_UPCOMING: "email.live-session-upcoming",
  COURSE_ACCESS_EXPIRING: "email.access-expiring",
  ASSESSMENT_DUE: "email.assessment-due",
  ABSENCE_NOTICE: "email.absence-notice",
  COURSE_RECOMMENDATION: "email.course-recommendation",
} as const;

/**
 * Forma exacta que usa `apps/api` al encolar en la cola "email"
 * (`NotificationService.enqueueEmail`) — el HTML ya viene armado. El worker
 * reutiliza el mismo shape para los jobs que produce él mismo.
 */
export interface EmailJobPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /**
   * Bolsa libre. `apps/api` la usa para datos de la plantilla (p.ej.
   * `{ token }`, `{ orderId }`). El worker, cuando es quien produce el job,
   * además mete `{ userId, notificationId }` ahí para poder actualizar el
   * `Notification` que él mismo crea antes de encolar — ver
   * `email.processor.ts`.
   */
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Cola "certificate" — mirror de CERTIFICATE_JOBS. apps/api ya creó la fila
// `Certificate` (con finalScore/criteriaSnapshot ya calculados) antes de
// encolar: el worker solo genera el PDF+QR y actualiza pdfAssetId/qrUrl.
// ---------------------------------------------------------------------------
export const CERTIFICATE_JOBS = {
  GENERATE: "certificate.generate",
} as const;

export interface CertificateGenerateJobData {
  certificateId: string;
}

// ---------------------------------------------------------------------------
// Cola "reminder" — mirror de REMINDER_JOBS. A la fecha de este entregable,
// apps/api define estos 3 nombres pero ningún código los encola todavía
// (ver IMPLEMENTATION-NOTES.md sección 1) — el worker se autoprograma con
// un 4° job interno (`reminder.sweep`, no expuesto a apps/api) que escanea
// la base y termina generando estos 3 tipos con un `delay` de BullMQ igual
// al tiempo que falta hasta el umbral (7d/24h/1h/10min/3d).
// ---------------------------------------------------------------------------
export const REMINDER_JOBS = {
  LIVE_SESSION_UPCOMING: "reminder.live-session-upcoming",
  COURSE_ACCESS_EXPIRING: "reminder.course-access-expiring",
  ASSESSMENT_DUE: "reminder.assessment-due",
} as const;

/** Job interno del worker, no forma parte del contrato de apps/api. */
export const REMINDER_SWEEP_JOB = "reminder.sweep";

export type LiveSessionOffset = "7d" | "24h" | "1h" | "10min";
export type DeadlineOffset = "3d" | "24h";

export interface LiveSessionUpcomingJobData {
  liveSessionId: string;
  offset: LiveSessionOffset;
}

export interface CourseAccessExpiringJobData {
  enrollmentId: string;
  offset: DeadlineOffset;
}

export interface AssessmentDueJobData {
  assessmentId: string;
  enrollmentId: string;
  offset: DeadlineOffset;
}

// ---------------------------------------------------------------------------
// Cola "attendance-sync" — mirror de ATTENDANCE_SYNC_JOBS. apps/api ya hace
// la sincronización síncrona en `POST /live-sessions/:id/sync-attendance` y
// además encola este mismo job para que el worker pueda re-sincronizar
// periódicamente sin depender de que un admin dispare el endpoint.
// ---------------------------------------------------------------------------
export const ATTENDANCE_SYNC_JOBS = {
  SYNC_LIVE_SESSION: "attendance-sync.sync-live-session",
} as const;

export interface AttendanceSyncJobData {
  liveSessionId: string;
}

// ---------------------------------------------------------------------------
// Cola "recommendation" — mirror de RECOMMENDATION_JOBS. apps/api encola
// esto (con solo `{ userId }`) cada vez que cambia el progreso de una
// matrícula; el worker recalcula TODAS las reglas para ese usuario (no solo
// un curso puntual), incluyendo la regla (c) de asignación por empresa, que
// se deriva de `Enrollment.source = "B2B_SEAT"` (apps/api no encola un job
// dedicado para eso).
// ---------------------------------------------------------------------------
export const RECOMMENDATION_JOBS = {
  REGENERATE_FOR_USER: "recommendation.regenerate-for-user",
} as const;

export interface RegenerateRecommendationsJobData {
  userId: string;
}

// ---------------------------------------------------------------------------
// Cola "invoice" — mirror de INVOICE_JOBS. apps/api (CommerceService.
// finalizeOrderPaid) ya creó la fila `ElectronicInvoice` en estado PENDING
// (con documentType/series/correlativo/datos del comprador ya resueltos) —
// se dispara siempre que una orden pasa a PAID, sin importar si fue por el
// cargo síncrono de Culqi/Stripe en el propio POST /checkout o por un
// webhook async; se omite por completo cuando order.total es 0 (cursos
// gratuitos, ver commerce.service.ts). El worker solo firma el XML UBL 2.1,
// lo empaqueta y lo envía a SUNAT (o lo simula si no hay credenciales
// reales configuradas — ver processors/invoice.processor.ts).
// ---------------------------------------------------------------------------
export const INVOICE_JOBS = {
  GENERATE: "invoice.generate",
} as const;

export interface InvoiceGenerateJobData {
  invoiceId: string;
}

// ============================================================================
// Nombres de colas y jobs BullMQ.
//
// IMPORTANTE PARA EL EQUIPO DE apps/worker: estos son los nombres EXACTOS de
// cola y de job que esta API encola. El worker debe registrar procesadores
// con estos mismos nombres para consumir los jobs. Ver
// apps/api/IMPLEMENTATION-NOTES.md sección 2 para el detalle de cada payload.
// ============================================================================

export const QUEUE_NAMES = {
  EMAIL: "email",
  CERTIFICATE: "certificate",
  REMINDER: "reminder",
  ATTENDANCE_SYNC: "attendance-sync",
  RECOMMENDATION: "recommendation",
  INVOICE: "invoice",
  SUGGESTION: "suggestion",
  SUBTITLES: "subtitles",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const ALL_QUEUE_NAMES: QueueName[] = Object.values(QUEUE_NAMES);

// --- Jobs de la cola "email" ---
export const EMAIL_JOBS = {
  WELCOME: "email.welcome",
  VERIFY_EMAIL: "email.verify-email",
  FORGOT_PASSWORD: "email.forgot-password",
  RECEIPT: "email.receipt",
  COMPANY_INVITE: "email.company-invite",
  CERTIFICATE_READY: "email.certificate-ready",
  SUPPORT_TICKET_UPDATE: "email.support-ticket-update",
  LIVE_SESSION_RESCHEDULED: "email.live-session-rescheduled",
  CERTIFICATE_COPY: "email.certificate-copy",
  GENERIC: "email.generic",
} as const;

// --- Jobs de la cola "certificate" ---
export const CERTIFICATE_JOBS = {
  GENERATE: "certificate.generate",
} as const;

// --- Jobs de la cola "reminder" ---
export const REMINDER_JOBS = {
  LIVE_SESSION_UPCOMING: "reminder.live-session-upcoming",
  COURSE_ACCESS_EXPIRING: "reminder.course-access-expiring",
  ASSESSMENT_DUE: "reminder.assessment-due",
} as const;

// --- Jobs de la cola "attendance-sync" ---
export const ATTENDANCE_SYNC_JOBS = {
  SYNC_LIVE_SESSION: "attendance-sync.sync-live-session",
} as const;

// --- Jobs de la cola "recommendation" ---
export const RECOMMENDATION_JOBS = {
  REGENERATE_FOR_USER: "recommendation.regenerate-for-user",
} as const;

// --- Jobs de la cola "invoice" ---
export const INVOICE_JOBS = {
  GENERATE: "invoice.generate",
  GENERATE_NOTE: "invoice.generate-note",
} as const;

// --- Jobs de la cola "suggestion" ---
export const SUGGESTION_JOBS = {
  // Delayed job (delay = suggestionAutoRespondDelayMinutes) — a propósito
  // no es inmediato: "si le llega inmediato al usuario, va a darse cuenta
  // que es una IA". El worker revisa si el admin ya respondió a mano antes
  // de que se cumpla el plazo; si es así, no hace nada.
  AUTO_RESPOND: "suggestion.auto-respond",
} as const;

// --- Jobs de la cola "subtitles" ---
export const SUBTITLES_JOBS = {
  GENERATE: "subtitles.generate",
} as const;

// Espejo en TypeScript de los enums definidos en prisma/schema.prisma.
// Mantener sincronizado manualmente: es la fuente de verdad para el frontend
// (que no puede importar @prisma/client directamente).

export const GLOBAL_ROLES = ["STUDENT", "TEACHER", "SUPPORT", "ADMIN", "COMPANY", "EXTERNAL"] as const;
export type GlobalRole = (typeof GLOBAL_ROLES)[number];

export const OFFERING_MODALITIES = ["RECORDED", "LIVE", "HYBRID"] as const;
export type OfferingModality = (typeof OFFERING_MODALITIES)[number];

export const OFFERING_TYPES = [
  "COURSE",
  "WORKSHOP",
  "SEMINAR",
  "MASTERCLASS",
  "PROGRAM",
  "DIPLOMA",
  "CORPORATE_INHOUSE",
] as const;
export type OfferingType = (typeof OFFERING_TYPES)[number];

export const OFFERING_LEVELS = ["INITIAL", "INTERMEDIATE", "ADVANCED"] as const;
export type OfferingLevel = (typeof OFFERING_LEVELS)[number];

export const OFFERING_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type OfferingStatus = (typeof OFFERING_STATUSES)[number];

export const ACCESS_DURATION_POLICIES = ["DAYS_30", "MONTHS_6", "PERMANENT"] as const;
export type AccessDurationPolicy = (typeof ACCESS_DURATION_POLICIES)[number];

export const ENROLLMENT_SOURCES = ["B2C_PURCHASE", "B2B_SEAT", "FREE", "ADMIN_GRANTED"] as const;
export type EnrollmentSource = (typeof ENROLLMENT_SOURCES)[number];

export const ENROLLMENT_STATUSES = ["ACTIVE", "COMPLETED", "EXPIRED", "CANCELLED"] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const COMPANY_MEMBERSHIP_ROLES = ["COMPANY_ADMIN", "PARTICIPANT"] as const;
export type CompanyMembershipRole = (typeof COMPANY_MEMBERSHIP_ROLES)[number];

export const QUESTION_TYPES = [
  "SINGLE_CHOICE",
  "MULTI_CHOICE",
  "TRUE_FALSE",
  "SHORT_ANSWER",
  "OPEN",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const ATTEMPT_STATUSES = [
  "IN_PROGRESS",
  "GRADED",
  "PENDING_REVIEW",
  "PASSED",
  "FAILED",
] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const PAYMENT_PROVIDERS = ["CULQI", "STRIPE", "PAYPAL"] as const;
export type PaymentProviderType = (typeof PAYMENT_PROVIDERS)[number];

export const ORDER_STATUSES = ["PENDING", "PAID", "FAILED", "REFUNDED", "CANCELLED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const TICKET_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_USER", "RESOLVED", "CLOSED"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const CALENDAR_EVENT_TYPES = [
  "LIVE_CLASS",
  "COURSE_START",
  "COURSE_DEADLINE",
  "ASSIGNMENT_DUE",
  "EXAM",
  "MENTORSHIP",
  "ACCESS_EXPIRATION",
] as const;
export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

export const OFFERING_KINDS = ["COURSE", "PROGRAM"] as const;
export type OfferingKind = (typeof OFFERING_KINDS)[number];

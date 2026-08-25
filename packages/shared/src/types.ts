// Tipos compartidos entre apps/api y apps/web.
// No dependen de @prisma/client para que el frontend los pueda importar.

import type {
  GlobalRole,
  OfferingModality,
  OfferingType,
  OfferingLevel,
  OfferingStatus,
  AccessDurationPolicy,
  EnrollmentSource,
  EnrollmentStatus,
  CompanyMembershipRole,
  AttemptStatus,
  PaymentProviderType,
  OrderStatus,
  TicketPriority,
  TicketStatus,
} from "./enums";

/** Texto traducible: { es: "...", en: "..." } */
export type LocalizedText = Record<string, string>;

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  globalRole: GlobalRole;
  locale: string;
  timezone: string;
  profileCompletedAt?: string | null;
}

export interface AuthTokens {
  accessToken: string;
  // el refreshToken se entrega como cookie httpOnly, no en el body
}

export interface AreaSummary {
  id: string;
  slug: string;
  name: LocalizedText;
  icon?: string | null;
}

export interface CourseCardDTO {
  id: string;
  slug: string;
  title: LocalizedText;
  subtitle?: LocalizedText | null;
  modality: OfferingModality;
  type: OfferingType;
  level: OfferingLevel;
  areaSlug: string;
  durationHours: number;
  durationUnit?: "HOURS" | "WEEKS" | "MONTHS";
  coverImageUrl?: string | null;
  teacherName?: string | null;
  nextLiveSessionAt?: string | null;
  certificationIncluded: boolean;
  // priceAmount es el precio EFECTIVO (con descuento aplicado si isOnSale) —
  // originalPriceAmount solo viene poblado cuando hay oferta vigente, para
  // mostrar el tachado.
  priceAmount: string;
  priceCurrency: string;
  b2bAvailable: boolean;
  isOnSale?: boolean;
  originalPriceAmount?: string | null;
  discountPercent?: number | null;
  discountExpiresAt?: string | null;
}

export interface CatalogFilters {
  q?: string;
  areaSlug?: string;
  modality?: OfferingModality;
  level?: OfferingLevel;
  type?: OfferingType;
  language?: string;
  minPrice?: number;
  maxPrice?: number;
  certificationOnly?: boolean;
  sort?: "newest" | "priceAsc" | "priceDesc" | "bestSelling";
  page?: number;
  pageSize?: number;
}

export interface CourseDetailDTO extends CourseCardDTO {
  description?: LocalizedText | null;
  accessDurationPolicy: AccessDurationPolicy;
  subtitleLanguages: string[];
  prerequisiteCourseIds: string[];
  nextRecommendedCourseIds: string[];
  modules: {
    id: string;
    order: number;
    title: LocalizedText;
    lessons: { id: string; order: number; title: LocalizedText; durationMinutes?: number | null; isFreePreview: boolean }[];
  }[];
  liveSessions: { id: string; startsAt: string; endsAt: string; timezone: string }[];
}

export interface ProgramDetailDTO {
  id: string;
  slug: string;
  title: LocalizedText;
  description?: LocalizedText | null;
  priceAmount: string;
  priceCurrency: string;
  certificationIncluded: boolean;
  courses: { courseId: string; order: number; isRequired: boolean; course: CourseCardDTO }[];
  separatePriceTotal: string;
  savingsAmount: string;
}

export interface CheckoutItemInput {
  offeringKind: "COURSE" | "PROGRAM";
  courseId?: string;
  programId?: string;
  seatPoolQty?: number; // compra B2B de cupos
}

export interface CheckoutRequest {
  items: CheckoutItemInput[];
  currency: "PEN" | "USD";
  paymentProvider: PaymentProviderType;
  companyId?: string; // si la compra es a nombre de una empresa (B2B)
  paymentMethodToken: string; // token generado por el SDK de Culqi/Stripe en el cliente
}

export interface CheckoutResult {
  orderId: string;
  status: OrderStatus;
  enrollmentIds: string[];
  receiptUrl?: string | null;
}

export interface EnrollmentSummaryDTO {
  id: string;
  offeringKind: "COURSE" | "PROGRAM";
  courseId?: string | null;
  programId?: string | null;
  title: LocalizedText;
  coverImageUrl?: string | null;
  progressPct: number;
  status: EnrollmentStatus;
  source: EnrollmentSource;
  accessExpiresAt?: string | null;
  nextActionLabel?: string | null; // "Continúa en el Módulo 3" / "Próxima clase: ..."
  certificateAvailable: boolean;
  approvalMissing: string[]; // p.ej. ["Completa el módulo 5", "Alcanza 80% de asistencia"]
}

export interface AssessmentAttemptSubmission {
  answers: { questionId: string; response: unknown }[];
}

export interface AssessmentResultDTO {
  attemptId: string;
  score: number | null;
  status: AttemptStatus;
  pendingReviewCount: number;
}

export interface CertificateDTO {
  id: string;
  code: string;
  issuedAt: string;
  title: LocalizedText;
  finalScore?: number | null;
  pdfUrl?: string | null;
  verificationUrl: string;
}

export interface CompanyDashboardSummaryDTO {
  companyId: string;
  legalName: string;
  activeParticipants: number;
  seatsAvailable: number;
  seatsUsed: number;
  averageProgressPct: number;
  atRiskParticipants: number;
  upcomingLiveSessions: { courseTitle: LocalizedText; startsAt: string }[];
}

export interface SupportTicketSummaryDTO {
  id: string;
  subject: string;
  category: string;
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: string;
  lastMessageAt?: string | null;
  // Solo viene poblado en /admin/soporte (staff global viendo TODOS los
  // tickets) — en "mis tickets" (alumno/docente) es siempre uno mismo, no hace falta.
  createdByName?: string;
  createdByEmail?: string;
}

export interface AdminExceptionDTO {
  id: string;
  type:
    | "PAYMENT_WITHOUT_ENROLLMENT"
    | "STUDENT_WITHOUT_ACCESS_BEFORE_CLASS"
    | "COURSE_WITHOUT_TEACHER"
    | "COMPANY_SEATS_EXPIRING"
    | "EXAM_PENDING_REVIEW";
  severity: "LOW" | "MEDIUM" | "HIGH";
  message: string;
  entityId: string;
  createdAt: string;
}

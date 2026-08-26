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
  // Roles adicionales — un docente puede además ser alumno/admin/soporte al
  // mismo tiempo (globalRole sigue siendo el rol principal/panel por defecto).
  secondaryRoles: GlobalRole[];
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
  language?: string;
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
  // Promedio de estrellas (1-5) y cantidad de reseñas — solo se envían
  // valores reales cuando PlatformSettings.courseCardFields.showRating está
  // activo (ver AppearanceForm); si el admin lo desactiva o no hay
  // calificaciones aún, ambos vienen null/0.
  avgRating?: number | null;
  ratingsCount?: number;
}

export interface CourseReviewDTO {
  stars: number;
  comment: string | null;
  createdAt: string;
  authorName: string;
}

// "El administrador podría crear secciones en la página — tal vez un curso
// diga a quién va dirigido, tal vez no" — secciones libres, opcionales,
// ordenables, que el admin arma por curso (a diferencia de "description",
// que es fija). Null/vacío = el curso no muestra ninguna sección extra.
export interface CourseDetailSection {
  id: string;
  title: LocalizedText;
  body: LocalizedText;
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
  reviews?: CourseReviewDTO[];
  detailSections?: CourseDetailSection[];
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
  // El curso ya cumple todo lo demás y solo falta que el alumno califique
  // con estrellas — dispara el modal visual CourseRatingPrompt en el campus.
  readyForRatingPrompt: boolean;
  // "El curso aparece en ambas pestañas" — no es un bug de filtro (una
  // matrícula nunca aparece en las dos a la vez): al volver a llevar un
  // curso se crea una SEGUNDA matrícula independiente, con su propio id,
  // mientras la original (ya aprobada) sigue en Finalizados. Ambas
  // tarjetas mostraban el mismo título sin ninguna forma de distinguirlas
  // — se agrega la fecha de esta matrícula puntual para diferenciarlas.
  enrolledAt: string;
}

export interface AssessmentAttemptSubmission {
  answers: { questionId: string; response: unknown }[];
}

export interface AssessmentResultDTO {
  attemptId: string;
  score: number | null;
  status: AttemptStatus;
  pendingReviewCount: number;
  // "Si el alumno obtuvo la nota mínima y el admin permite más de un
  // intento, ¿puede volver a rendir para sacar mejor nota?" — sí (se
  // califica con el mejor intento), pero antes la UI no mostraba cuántos
  // intentos quedaban ni ofrecía reintentar, había que saber navegar de
  // vuelta al examen a mano.
  attemptsUsed: number;
  maxAttempts: number;
  // "Verificar que no haya excedido la duración máxima al enviar las
  // respuestas" — true si el tiempo real (server-side) superó el límite
  // del examen; en ese caso el intento nunca queda PASSED.
  timedOut: boolean;
  // "Si no lo pasa después de los intentos, tendrá que volver a repasar
  // todo el material de nuevo" — true cuando ESTE intento agotó
  // maxAttempts sin aprobar: el avance de lecciones/lecturas de la
  // matrícula se acaba de resetear (ver EnrollmentService.
  // resetMaterialForRetry). attemptsUsed de arriba todavía muestra el
  // conteo del ciclo que se acaba de agotar (p.ej. "3 de 3") — la próxima
  // vez que el alumno consulte el examen, ya verá 0 usados del ciclo nuevo.
  materialReset: boolean;
}

export interface CertificateDTO {
  id: string;
  code: string;
  issuedAt: string;
  title: LocalizedText;
  finalScore?: number | null;
  pdfUrl?: string | null;
  verificationUrl: string;
  // "El alumno debe ver alguna notificación para saber a quién se le envía
  // el certificado, para que no piense que nunca le va a llegar" — solo
  // relevante en matrículas de empresa; STUDENT | COMPANY_ADMIN | BOTH.
  deliveredTo?: string;
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

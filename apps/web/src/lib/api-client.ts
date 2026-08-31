import type {
  AreaSummary,
  CourseCardDTO,
  CourseDetailDTO,
  ProgramDetailDTO,
  CatalogFilters,
  AuthUser,
  AuthTokens,
  CheckoutRequest,
  CheckoutResult,
  EnrollmentSummaryDTO,
  CertificateDTO,
  AssessmentResultDTO,
  CompanyDashboardSummaryDTO,
  SupportTicketSummaryDTO,
  AdminExceptionDTO,
  LocalizedText,
} from "@inkademy/shared";
import { getClientAccessToken, setClientAccessToken, clearClientAccessToken } from "./auth";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  statusCode: number;
  error?: string;
  constructor(statusCode: number, message: string, error?: string) {
    super(message);
    this.statusCode = statusCode;
    this.error = error;
  }
}

interface FetchOptions extends RequestInit {
  /** Token explícito (server components: viene de cookies()) */
  accessToken?: string | null;
  /** Evita el intento automático de refresh (usado por el propio refresh) */
  skipRefresh?: boolean;
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, query?: FetchOptions["query"]) {
  const url = new URL(path.startsWith("http") ? path : `${API_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

/**
 * Wrapper de fetch tipado contra la API de Inkademy (docs/API-CONTRACT.md).
 * - Adjunta Bearer token (localStorage en cliente, cookie en servidor).
 * - Reintenta una vez tras /auth/refresh si recibe 401.
 * - Si la API no responde (aún en construcción en paralelo), el llamador
 *   decide si usa datos simulados (ver comentarios "MOCK" en cada página).
 */
export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { accessToken, skipRefresh, query, headers, ...rest } = options;
  const token = accessToken ?? (typeof window !== "undefined" ? getClientAccessToken() : null);

  const res = await fetch(buildUrl(path, query), {
    ...rest,
    credentials: "include",
    headers: {
      ...(rest.body && !(rest.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  }).catch((err) => {
    throw new ApiError(0, `No se pudo conectar con la API (${API_URL}). ${String(err)}`, "NETWORK_ERROR");
  });

  if (res.status === 401 && !skipRefresh && typeof window !== "undefined") {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return apiFetch<T>(path, { ...options, accessToken: refreshed, skipRefresh: true });
    }
    clearClientAccessToken();
  }

  if (res.status === 204) return undefined as T;

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : await res.text();

  if (!res.ok) {
    const message = (isJson && body && (body as any).message) || res.statusText || "Error de API";
    throw new ApiError(res.status, Array.isArray(message) ? message.join(", ") : message, (body as any)?.error);
  }

  return body as T;
}

/**
 * Expuesto para que AuthProvider pueda refrescar el access token de forma
 * proactiva (ver setInterval en AuthProvider.tsx) — antes solo se refrescaba
 * de forma reactiva, una vez que un fetch YA había fallado con 401. Eso
 * cubre los fetches del cliente, pero las páginas server-rendered
 * (Server Components, la mayoría del contenido de /campus, /admin,
 * /docente) leen la cookie legible `inkademy_at` directamente — sin este
 * refresco proactivo, esa cookie expiraba a los 15 min (JWT_ACCESS_TTL) y
 * cualquier navegación server-side entre esa expiración y el próximo fetch
 * de cliente exitoso mostraba la pantalla de "sesión expirada".
 */
export async function tryRefresh(): Promise<string | null> {
  try {
    const data = await apiFetch<AuthTokens>("/auth/refresh", { method: "POST", skipRefresh: true });
    if (data?.accessToken) {
      setClientAccessToken(data.accessToken);
      return data.accessToken;
    }
  } catch {
    // sin sesión válida
  }
  return null;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export interface SocialLinks {
  linkedin?: string;
  instagram?: string;
  facebook?: string;
  twitter?: string;
  tiktok?: string;
}

/** Shape completo de GET /profile — todos los campos del perfil (sin passwordHash). */
export interface FullProfileDTO extends AuthUser {
  documentType: string | null;
  documentNumber: string | null;
  country: string | null;
  city: string | null;
  address: string | null;
  birthDate: string | null;
  phone: string | null;
  jobTitle: string | null;
  companyFreeText: string | null;
  sector: string | null;
  interests: string[];
  experienceLevel: "ENTRY" | "MID" | "SENIOR" | "EXECUTIVE" | null;
  socialLinks: SocialLinks | null;
  marketingConsentEmail: boolean;
  marketingConsentWhatsapp: boolean;
  // "Los docentes deberán poder registrar su número de cuenta bancaria, CCI y banco".
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountCci: string | null;
}

export const authApi = {
  register: (input: unknown) => apiFetch<{ user: AuthUser; accessToken: string }>("/auth/register", { method: "POST", body: JSON.stringify(input) }),
  login: (input: unknown) => apiFetch<{ user: AuthUser; accessToken: string }>("/auth/login", { method: "POST", body: JSON.stringify(input) }),
  logout: () => apiFetch<void>("/auth/logout", { method: "POST" }),
  // Rota la sesión del lado del servidor (cierra otros dispositivos) — devuelve un accessToken fresco para que ESTE no se desconecte.
  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch<{ accessToken: string }>("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
  me: (accessToken?: string | null) => apiFetch<AuthUser>("/auth/me", { accessToken }),
  forgotPassword: (email: string) => apiFetch<void>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (input: { token: string; password: string }) => apiFetch<void>("/auth/reset-password", { method: "POST", body: JSON.stringify(input) }),
  getFullProfile: (accessToken?: string | null) => apiFetch<FullProfileDTO>("/profile", { accessToken, cache: "no-store" }),
  completeProfile: (input: unknown, accessToken?: string | null) => apiFetch<AuthUser>("/profile", { method: "PATCH", body: JSON.stringify(input), accessToken }),
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<AuthUser>("/profile/avatar", { method: "POST", body: form });
  },
};

// ---------------------------------------------------------------------------
// Catálogo público
// ---------------------------------------------------------------------------
// Zona de pruebas del admin: resultado de un borrado en lote — lo que no
// estaba "limpio" se omite (nunca se aborta el lote entero) con el motivo.
export interface BulkDeleteResult {
  deleted: string[];
  skipped: { id: string; reason: string }[];
}

export interface CourseCardFields {
  showTeacher: boolean;
  showDuration: boolean;
  showNextLiveSession: boolean;
  showCertificationBadge: boolean;
  showRating: boolean;
}

export interface PlatformSettingsDTO {
  id: string;
  logoUrl: string | null;
  logoHeightPx: number;
  headingFontFamily: string;
  bodyFontFamily: string;
  backgroundColor: string | null;
  backgroundImageUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
  courseCardFields: CourseCardFields;
  institutionSignatureAssetId?: string | null;
  institutionSignatureUrl?: string | null;
  institutionSignatureName?: string | null;
  institutionSignatureTitle?: string | null;
  /** Único campo de SunatSettings expuesto en público — el checkout lo usa para mostrar el desglose de IGV antes de pagar. */
  taxAffectation?: "EXONERADO" | "GRAVADO";
  watermarkAssetId?: string | null;
  watermarkUrl?: string | null;
  watermarkOpacityPct?: number;
  watermarkSizePercent?: number;
  sidebarColor?: string | null;
  menuFontFamily?: string | null;
  menuFontSizePx?: number | null;
  menuFontColor?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  certificateEmailText?: Record<string, string> | null;
  certificateEmailFontFamily?: string | null;
  certificateEmailTextAlign?: "left" | "center" | "right" | "justify";
  certificateEmailTextColor?: string | null;
}

/** GET /admin/sunat-settings — los secretos nunca llegan en texto plano, solo flags hasX. */
export interface SunatSettingsDTO {
  env: "beta" | "production";
  ruc: string | null;
  solUser: string | null;
  razonSocial: string | null;
  address: string | null;
  ubigeo: string | null;
  boletaSeries: string | null;
  facturaSeries: string | null;
  boletaCreditSeries: string | null;
  facturaCreditSeries: string | null;
  taxAffectation: "EXONERADO" | "GRAVADO";
  igvPercent: number;
  hasSolPassword: boolean;
  hasCertPem: boolean;
  hasCertKeyPem: boolean;
  updatedAt: string | null;
}

export interface ChatbotSettingsDTO {
  enabled: boolean;
  provider: string;
  model: string;
  systemPrompt: string | null;
  hasApiKey: boolean;
  suggestionAutoRespond: boolean;
  suggestionAutoRespondDelayMinutes: number;
  updatedAt: string | null;
}

export interface EmailServerSettingsDTO {
  host: string | null;
  port: number | null;
  secure: boolean;
  username: string | null;
  hasPassword: boolean;
  fromEmail: string | null;
  fromName: string | null;
  configuredInDb: boolean;
  updatedAt: string | null;
}

export interface EmailAudienceFilter {
  interests?: string[];
  areaIds?: string[];
  companyId?: string;
  inactiveDays?: number;
}

export interface EmailCampaignDTO {
  id: string;
  name: string;
  mode: "AUTOMATIC_AI" | "MANUAL";
  goal: "RELATED_COURSES" | "NEW_COURSES" | "DISCOUNTED_COURSES" | "BY_INTEREST" | null;
  status: "DRAFT" | "SCHEDULED" | "SENT" | "CANCELLED";
  subject: string | null;
  bodyHtml: string | null;
  audienceFilter: EmailAudienceFilter | null;
  scheduledAt: string | null;
  sentAt: string | null;
  recurrence: "ONCE" | "WEEKLY" | "MONTHLY";
  recipientCount: number;
  createdAt: string;
  createdBy?: { firstName: string; lastName: string } | null;
}

export const settingsApi = {
  // "no-store": la propia pantalla de /admin/apariencia promete que los
  // cambios se ven "al instante" — con el cache por defecto de fetch() en
  // Server Components (force-cache) quedaba una respuesta vieja pegada
  // indefinidamente (así se detectó: courseCardFields/contactEmail nunca
  // aparecían aunque la fila en BD ya los tenía).
  get: () => apiFetch<PlatformSettingsDTO>("/settings", { cache: "no-store" }),
};

// "cache: no-store" en las 5 — antes estas llamadas no fijaban ninguna
// opción de cache, y al ser Server Components sin cookies() de por medio
// (páginas públicas), Next.js las trataba como estáticas y cacheaba la
// respuesta indefinidamente: un curso recién editado (imagen, descuento,
// precio) no se veía reflejado en la home/catálogo hasta el próximo
// build/deploy, aunque la API ya tuviera el dato nuevo.
export const catalogApi = {
  areas: () => apiFetch<AreaSummary[]>("/areas", { cache: "no-store" }),
  courses: (filters: CatalogFilters = {}) =>
    apiFetch<{ items: CourseCardDTO[]; total: number; page: number; pageSize: number }>("/courses", {
      query: filters as Record<string, any>,
      cache: "no-store",
    }),
  course: (slug: string) => apiFetch<CourseDetailDTO>(`/courses/${slug}`, { cache: "no-store" }),
  program: (slug: string) => apiFetch<ProgramDetailDTO>(`/programs/${slug}`, { cache: "no-store" }),
  sections: () =>
    apiFetch<{
      featured: CourseCardDTO[];
      upcomingLive: CourseCardDTO[];
      new: CourseCardDTO[];
      recommendedPaths: CourseCardDTO[];
      mostDemanded: CourseCardDTO[];
    }>("/catalog/sections", { cache: "no-store" }),
};

// ---------------------------------------------------------------------------
// Campus del alumno
// ---------------------------------------------------------------------------
export const meApi = {
  enrollments: (status?: string, accessToken?: string | null) =>
    apiFetch<EnrollmentSummaryDTO[]>("/me/enrollments", { query: { status }, accessToken }),
  enrollment: (id: string, accessToken?: string | null) => apiFetch<any>(`/me/enrollments/${id}`, { accessToken }),
  updateLessonProgress: (lessonId: string, input: { completed?: boolean; lastPositionSeconds?: number }) =>
    apiFetch<{ progressPct: number; status: string; readyForRatingPrompt: boolean }>(`/me/lessons/${lessonId}/progress`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  // "El alumno deberá marcar como leído" (solo lecturas principales) — recalcula progressPct igual que una lección.
  markMaterialRead: (materialId: string) =>
    apiFetch<{ progressPct: number; status: string; readyForRatingPrompt: boolean }>(`/me/materials/${materialId}/read`, { method: "PATCH" }),
  // "Las notas del alumno se guardaban solo en localStorage" — ahora sincronizan entre dispositivos.
  lessonNote: (lessonId: string) => apiFetch<{ content: string; updatedAt: string | null }>(`/me/lessons/${lessonId}/notes`),
  saveLessonNote: (lessonId: string, content: string) =>
    apiFetch<{ content: string; updatedAt: string | null }>(`/me/lessons/${lessonId}/notes`, { method: "PATCH", body: JSON.stringify({ content }) }),
  // "Marcar las estrellas que considera del curso y poner un comentario
  // debajo" — al terminar el curso, ver CourseRatingPrompt.
  submitRating: (enrollmentId: string, stars: number, comment?: string) =>
    apiFetch<{ saved: boolean }>(`/me/enrollments/${enrollmentId}/rating`, {
      method: "POST",
      body: JSON.stringify({ stars, comment }),
    }),
  // "Si vuelves a llevar el curso es gratis" — matrícula nueva sin checkout.
  retakeCourse: (enrollmentId: string) =>
    apiFetch<{ enrollmentId: string }>(`/me/enrollments/${enrollmentId}/retake`, { method: "POST" }),
  // Token de sesión de reproducción SCORM (alcance acotado, 6h) — ver
  // ScormService.createSession. playerUrl es relativo a API_URL.
  scormSession: (enrollmentId: string, lessonId: string) =>
    apiFetch<{ token: string; playerUrl: string }>(`/me/enrollments/${enrollmentId}/lessons/${lessonId}/scorm-session`, { method: "POST" }),
  calendar: (from?: string, to?: string, accessToken?: string | null) =>
    apiFetch<any[]>("/me/calendar", { query: { from, to }, accessToken }),
  certificates: (accessToken?: string | null) => apiFetch<CertificateDTO[]>("/me/certificates", { accessToken }),
  recommendations: (accessToken?: string | null) => apiFetch<CourseCardDTO[]>("/me/recommendations", { accessToken }),
  orders: (accessToken?: string | null) => apiFetch<any[]>("/me/orders", { accessToken }),
  // "Hay una opción de Guardados. ¿Cómo guardo un curso?" — lista personal de interés, sin matricularse.
  savedCourses: (accessToken?: string | null) => apiFetch<CourseCardDTO[]>("/me/saved-courses", { accessToken, cache: "no-store" }),
  isCourseSaved: (courseId: string, accessToken?: string | null) =>
    apiFetch<{ saved: boolean }>(`/me/saved-courses/${courseId}`, { accessToken, cache: "no-store" }),
  saveCourse: (courseId: string) => apiFetch<{ saved: boolean }>(`/me/saved-courses/${courseId}`, { method: "POST" }),
  unsaveCourse: (courseId: string) => apiFetch<{ saved: boolean }>(`/me/saved-courses/${courseId}`, { method: "DELETE" }),
};

// ---------------------------------------------------------------------------
// Checkout / comercio
// ---------------------------------------------------------------------------
export const commerceApi = {
  checkout: (input: CheckoutRequest) => apiFetch<CheckoutResult>("/checkout", { method: "POST", body: JSON.stringify(input) }),
  // Paso previo del checkout con PayPal — ver lib/paypal.ts.
  createPayPalOrder: (input: { items: CheckoutRequest["items"]; companyId?: string }) =>
    apiFetch<{ orderId: string; amount: number; currency: string }>("/checkout/paypal-order", { method: "POST", body: JSON.stringify(input) }),
  order: (id: string, accessToken?: string) => apiFetch<any>(`/orders/${id}`, { accessToken }),
  // Reembolsa el cobro original y emite la nota de crédito SUNAT — solo ADMIN/SUPPORT.
  cancelOrder: (id: string, reasonDescription: string, accessToken?: string) =>
    apiFetch<{ orderId: string; status: string; noteId: string }>(`/orders/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reasonDescription }),
      accessToken,
    }),
  // Otorga acceso gratuito a un curso/programa con precio — nunca genera comprobante SUNAT.
  grantFree: (
    input: {
      offeringKind: "COURSE" | "PROGRAM";
      courseSlug?: string;
      programSlug?: string;
      userEmail?: string;
      companyId?: string;
      seatPoolQty?: number;
      note: string;
    },
    accessToken?: string,
  ) => apiFetch<{ granted: string }>("/grants", { method: "POST", body: JSON.stringify(input), accessToken }),
  // Zona de pruebas: deshace una orden sin comprobante SUNAT emitido (sin reembolso real) y cancela su matrícula — solo ADMIN.
  cancelTestOrder: (id: string, accessToken?: string) =>
    apiFetch<{ orderId: string; status: string; cancelledEnrollmentIds: string[] }>(`/orders/${id}/cancel-test`, {
      method: "POST",
      accessToken,
    }),
};

// ---------------------------------------------------------------------------
// Evaluación
// ---------------------------------------------------------------------------
export const assessmentApi = {
  // "No pudimos cargar tu campus" real en /campus/cursos/.../evaluacion/... —
  // esta llamada corre en un Server Component (primera carga Y cada
  // navegación, por ser RSC) y nunca mandaba el token: en el servidor
  // `apiFetch` solo saca el token de `getClientAccessToken()`, que no existe
  // ahí (typeof window === "undefined"). Sin accessToken explícito, la API
  // siempre respondía 401 — y withFallback relanza 401/403 a propósito (no
  // los absorbe como "datos de referencia"), así que la página se rompía
  // para CUALQUIER alumno real, siempre. Ver AssessmentPage.
  get: (id: string, accessToken?: string | null) => apiFetch<any>(`/assessments/${id}`, { accessToken }),
  createAttempt: (assessmentId: string) => apiFetch<any>(`/assessments/${assessmentId}/attempts`, { method: "POST" }),
  submit: (attemptId: string, input: unknown) =>
    apiFetch<AssessmentResultDTO>(`/attempts/${attemptId}/submit`, { method: "POST", body: JSON.stringify(input) }),
  attempt: (id: string) => apiFetch<any>(`/attempts/${id}`),
  // --- Examen "cualitativo" (archivo) — el alumno sube su respuesta como archivo ---
  uploadSubmission: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<{ assetId: string; mimeType: string }>("/attempts/uploads", { method: "POST", body: form });
  },
  submitFile: (attemptId: string, input: { submissionAssetId: string; submissionMimeType: string }) =>
    apiFetch<AssessmentResultDTO>(`/attempts/${attemptId}/submit-file`, { method: "POST", body: JSON.stringify(input) }),
};

// ---------------------------------------------------------------------------
// Certificados
// ---------------------------------------------------------------------------
export const certificateApi = {
  // Shape exacto de apps/api CertificateService.verifyByCode: {valid, code,
  // holderName, title (LocalizedText), issuedAt, status: "VALID"|"REVOKED"}.
  verify: (code: string) =>
    apiFetch<{
      valid: boolean;
      code: string;
      holderName?: string;
      title?: LocalizedText;
      issuedAt?: string | null;
      status: "VALID" | "REVOKED";
      pdfUrl?: string | null;
    }>(`/certificates/verify/${code}`),
  pdfUrl: (id: string) => `${API_URL}/certificates/${id}/pdf`,
  // Antes no existía ningún endpoint para listar certificados emitidos más
  // allá de "los míos" — /admin/certificados y /empresa/:id/certificados
  // mostraban siempre MOCK_CERTIFICATES sin importar los datos reales.
  listAll: (accessToken?: string | null) => apiFetch<any[]>("/admin/certificates", { accessToken }),
  // Reenvía el PDF del certificado por correo — antes solo se podía descargar o verificar.
  emailToSelf: (id: string, accessToken?: string | null) =>
    apiFetch<{ sent: boolean }>(`/certificates/${id}/email`, { method: "POST", accessToken }),
  // Fuerza a regenerar el PDF (aplica una firma/plantilla configurada
  // DESPUÉS de que el certificado ya se había emitido — el worker solo
  // renderiza una vez, así que sin esto el PDF viejo se quedaba congelado).
  regenerate: (id: string, accessToken?: string | null) =>
    apiFetch<{ regenerating: boolean }>(`/admin/certificates/${id}/regenerate`, { method: "POST", accessToken }),
};

// ---------------------------------------------------------------------------
// Aula virtual
// ---------------------------------------------------------------------------
export const liveSessionApi = {
  join: (id: string) => apiFetch<{ joinUrl: string; role: string }>(`/live-sessions/${id}/join`),
  create: (
    input: { courseId: string; title?: string; startsAt: string; endsAt: string; timezone?: string; capacity?: number; teacherId?: string },
    accessToken?: string | null,
  ) => apiFetch<any>("/live-sessions", { method: "POST", body: JSON.stringify(input), accessToken }),
  // "Repetir cada semana hasta que se cumpla la duración del curso".
  createSeries: (
    input: {
      courseId: string;
      title?: string;
      firstStartsAt: string;
      sessionDurationMinutes: number;
      timezone?: string;
      capacity?: number;
      teacherId?: string;
    },
    accessToken?: string | null,
  ) => apiFetch<any[]>("/live-sessions/series", { method: "POST", body: JSON.stringify(input), accessToken }),
  scheduleSummary: (courseId: string, accessToken?: string | null) =>
    apiFetch<{ totalHours: number; scheduledHours: number; remainingHours: number }>(`/live-sessions/schedule-summary/${courseId}`, { accessToken }),
  cancel: (id: string, reason: string, accessToken?: string | null) =>
    apiFetch<any>(`/live-sessions/${id}/cancel`, { method: "PATCH", body: JSON.stringify({ reason }), accessToken }),
  syncAttendance: (id: string, accessToken?: string | null) =>
    apiFetch<any>(`/live-sessions/${id}/sync-attendance`, { method: "POST", accessToken }),
  // Reprograma fecha/hora y notifica por correo a todos los inscritos activos.
  reschedule: (id: string, input: { startsAt: string; endsAt: string; reason: string }, accessToken?: string | null) =>
    apiFetch<{ notifiedCount: number }>(`/live-sessions/${id}/reschedule`, {
      method: "PATCH",
      body: JSON.stringify(input),
      accessToken,
    }),
};

// ---------------------------------------------------------------------------
// Empresas / B2B
// ---------------------------------------------------------------------------
export const companyApi = {
  create: (input: unknown, accessToken?: string | null) =>
    apiFetch<any>("/companies", { method: "POST", body: JSON.stringify(input), accessToken }),
  // A qué empresa(s) pertenece el usuario — usado por /empresa (rol Empresa) para resolver a dónde entrar.
  mine: (accessToken?: string | null) =>
    apiFetch<{ companyId: string; legalName: string; role: string }[]>("/companies/mine", { accessToken, cache: "no-store" }),
  dashboard: (id: string, accessToken?: string | null) =>
    apiFetch<CompanyDashboardSummaryDTO>(`/companies/${id}/dashboard`, { accessToken }),
  members: (id: string, query: Record<string, string | undefined> = {}, accessToken?: string | null) =>
    apiFetch<any[]>(`/companies/${id}/members`, { query, accessToken }),
  inviteMember: (id: string, input: unknown, accessToken?: string | null) =>
    apiFetch<any>(`/companies/${id}/members/invite`, { method: "POST", body: JSON.stringify(input), accessToken }),
  removeMember: (id: string, membershipId: string, accessToken?: string | null) =>
    apiFetch<void>(`/companies/${id}/members/${membershipId}`, { method: "DELETE", accessToken }),
  seatPools: (id: string, accessToken?: string | null) => apiFetch<any[]>(`/companies/${id}/seat-pools`, { accessToken }),
  certificates: (id: string, accessToken?: string | null) => apiFetch<any[]>(`/companies/${id}/certificates`, { accessToken }),
  certificateSettings: (id: string, accessToken?: string | null) =>
    apiFetch<{ certificateDeliveryTarget: "STUDENT" | "COMPANY_ADMIN" | "BOTH" }>(`/companies/${id}/certificate-settings`, { accessToken }),
  updateCertificateSettings: (id: string, certificateDeliveryTarget: "STUDENT" | "COMPANY_ADMIN" | "BOTH", accessToken?: string | null) =>
    apiFetch<any>(`/companies/${id}/certificate-settings`, { method: "PATCH", body: JSON.stringify({ certificateDeliveryTarget }), accessToken }),
  assignSeat: (id: string, poolId: string, userId: string, accessToken?: string | null) =>
    apiFetch<any>(`/companies/${id}/seat-pools/${poolId}/assign`, { method: "POST", body: JSON.stringify({ userId }), accessToken }),
  renewSeatPool: (id: string, poolId: string, months: number, accessToken?: string | null) =>
    apiFetch<any>(`/companies/${id}/seat-pools/${poolId}/renew`, { method: "PATCH", body: JSON.stringify({ months }), accessToken }),
  reports: (id: string, query: Record<string, string | undefined> = {}, accessToken?: string | null) =>
    apiFetch<any>(`/companies/${id}/reports`, { query, accessToken }),
  requestQuote: (id: string, input: unknown, accessToken?: string | null) =>
    apiFetch<any>(`/companies/${id}/quotes`, { method: "POST", body: JSON.stringify(input), accessToken }),
  quotes: (id: string, accessToken?: string | null) => apiFetch<any[]>(`/companies/${id}/quotes`, { accessToken }),
  updateQuoteStatus: (id: string, quoteId: string, status: "ACCEPTED" | "REJECTED", accessToken?: string | null) =>
    apiFetch<any>(`/companies/${id}/quotes/${quoteId}/status`, { method: "PATCH", body: JSON.stringify({ status }), accessToken }),
};

// ---------------------------------------------------------------------------
// Soporte
// ---------------------------------------------------------------------------
export const supportApi = {
  createTicket: (input: unknown, accessToken?: string | null) =>
    apiFetch<any>("/support/tickets", { method: "POST", body: JSON.stringify(input), accessToken }),
  // Antes sin `accessToken` acá: llamado desde un server component (sin
  // localStorage) no mandaba Authorization, la API respondía 401, y
  // withFallback (a propósito) relanza los 401 en vez de mostrar datos
  // simulados — /campus/soporte y /admin/soporte crasheaban siempre.
  tickets: (query: Record<string, string | undefined> = {}, accessToken?: string | null) =>
    apiFetch<SupportTicketSummaryDTO[]>("/support/tickets", { query, accessToken }),
  ticket: (id: string, accessToken?: string | null) => apiFetch<any>(`/support/tickets/${id}`, { accessToken }),
  addMessage: (id: string, body: string, accessToken?: string | null) =>
    apiFetch<any>(`/support/tickets/${id}/messages`, { method: "POST", body: JSON.stringify({ body }), accessToken }),
  // Borrador con IA para que soporte/admin lo revise antes de enviarlo, y
  // guardar el ticket ya resuelto como fuente del asistente.
  suggestReply: (id: string, accessToken?: string | null) =>
    apiFetch<{ draft: string }>(`/support/tickets/${id}/suggest-reply`, { method: "POST", accessToken }),
  saveAsKnowledge: (id: string, accessToken?: string | null) =>
    apiFetch<{ id: string; title: string; charCount: number }>(`/support/tickets/${id}/save-as-knowledge`, { method: "POST", accessToken }),
  // Indicador de "pendientes" al costado de Soporte en el menú del admin.
  pendingCount: (accessToken?: string | null) => apiFetch<number>("/support/tickets/pending-count", { accessToken, cache: "no-store" }),
};

// ---------------------------------------------------------------------------
// Sugerencias ("me gustaría un curso de...")
// ---------------------------------------------------------------------------
export const suggestionsApi = {
  create: (message: string, accessToken?: string | null) =>
    apiFetch<any>("/suggestions", { method: "POST", body: JSON.stringify({ message }), accessToken }),
  mine: (accessToken?: string | null) => apiFetch<any[]>("/suggestions/mine", { accessToken }),
  all: (accessToken?: string | null) => apiFetch<any[]>("/suggestions", { accessToken }),
  pendingCount: (accessToken?: string | null) => apiFetch<number>("/suggestions/pending-count", { accessToken, cache: "no-store" }),
  updateStatus: (id: string, status: string, accessToken?: string | null) =>
    apiFetch<any>(`/suggestions/${id}`, { method: "PATCH", body: JSON.stringify({ status }), accessToken }),
  respond: (id: string, response: string, accessToken?: string | null) =>
    apiFetch<any>(`/suggestions/${id}/respond`, { method: "POST", body: JSON.stringify({ response }), accessToken }),
  suggestReply: (id: string, accessToken?: string | null) =>
    apiFetch<{ draft: string }>(`/suggestions/${id}/suggest-reply`, { method: "POST", accessToken }),
  saveAsKnowledge: (id: string, accessToken?: string | null) =>
    apiFetch<{ id: string; title: string; charCount: number }>(`/suggestions/${id}/save-as-knowledge`, { method: "POST", accessToken }),
};

// ---------------------------------------------------------------------------
// Asistente de IA (chat flotante)
// ---------------------------------------------------------------------------
export const chatbotApi = {
  status: () => apiFetch<{ enabled: boolean }>("/chatbot/status", { cache: "no-store" }),
  sendMessage: (message: string, history: Array<{ role: "user" | "assistant"; content: string }>, accessToken?: string | null) =>
    apiFetch<{ reply: string }>("/chatbot/message", { method: "POST", body: JSON.stringify({ message, history }), accessToken }),
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export const adminApi = {
  kpis: (accessToken?: string | null) => apiFetch<any>("/admin/dashboard/kpis", { accessToken, cache: "no-store" }),
  kpiCharts: (accessToken?: string | null) => apiFetch<any>("/admin/dashboard/kpi-charts", { accessToken, cache: "no-store" }),
  exceptions: (accessToken?: string | null) => apiFetch<AdminExceptionDTO[]>("/admin/exceptions", { accessToken }),
  // `mine: true` fuerza el acotado "solo mis cursos asignados" aunque la
  // cuenta también tenga ADMIN/SUPPORT como rol secundario — lo usa
  // /docente/cursos, que debe mostrar SIEMPRE el subconjunto del docente
  // (si quisiera ver todo, entraría a /admin/catalogo). Sin este flag,
  // listCourses() trata cualquier ADMIN/SUPPORT como "sin restricción" (ver
  // teacherScopeId), que es lo correcto para /admin/catalogo pero vacía de
  // sentido a la pantalla "Mis cursos" del docente.
  courses: (accessToken?: string | null, opts?: { mine?: boolean; page?: number; pageSize?: number }) =>
    apiFetch<any[]>("/admin/courses", {
      accessToken,
      cache: "no-store",
      query: { ...(opts?.mine ? { mine: "true" } : {}), ...(opts?.page ? { page: opts.page } : {}), ...(opts?.pageSize ? { pageSize: opts.pageSize } : {}) },
    }),
  // Panel de docente: cursos asignados, próximas clases a dictar, cola de calificación — ver AdminService.getTeacherDashboard.
  teacherDashboard: (accessToken?: string | null) => apiFetch<any>("/admin/my-courses", { accessToken }),
  // "El docente también tiene que tener una agenda interactiva" — todas sus sesiones en vivo, mismo shape que /me/calendar.
  teacherAgenda: (accessToken?: string | null) => apiFetch<any[]>("/admin/my-agenda", { accessToken, cache: "no-store" }),
  programs: (accessToken?: string | null) => apiFetch<any[]>("/admin/programs", { accessToken }),
  areas: (accessToken?: string | null) => apiFetch<any[]>("/admin/areas", { accessToken }),
  createArea: (input: { slug: string; name: Record<string, string>; icon?: string; order?: number }, accessToken?: string | null) =>
    apiFetch<any>("/admin/areas", { method: "POST", body: JSON.stringify(input), accessToken }),
  updateArea: (id: string, input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>(`/admin/areas/${id}`, { method: "PATCH", body: JSON.stringify(input), accessToken }),
  updateProgram: (id: string, input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>(`/admin/programs/${id}`, { method: "PATCH", body: JSON.stringify(input), accessToken }),
  createProgram: (input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>("/admin/programs", { method: "POST", body: JSON.stringify(input), accessToken }),
  orders: (q: string | undefined, accessToken?: string | null, sortBy?: string) =>
    apiFetch<any[]>("/admin/orders", { accessToken, query: { ...(q ? { q } : {}), ...(sortBy ? { sortBy } : {}) } }),
  ordersSummary: (accessToken?: string | null) => apiFetch<any>("/admin/orders/summary", { accessToken, cache: "no-store" }),
  // --- Matrículas: ampliar plazo de acceso como caso especial ---
  enrollments: (q: string | undefined, accessToken?: string | null) =>
    apiFetch<any[]>("/admin/enrollments", { accessToken, query: q ? { q } : undefined, cache: "no-store" }),
  extendEnrollmentAccess: (id: string, accessExpiresAt: string | null, accessToken?: string | null) =>
    apiFetch<any>(`/admin/enrollments/${id}/extend-access`, {
      method: "PATCH",
      body: JSON.stringify({ accessExpiresAt }),
      accessToken,
    }),
  // "El admin debería poder resetear un avance a 0% o 100%... en casos extremos".
  resetEnrollmentProgress: (id: string, target: "ZERO" | "FULL", accessToken?: string | null) =>
    apiFetch<{ progressPct: number; status: string }>(`/admin/enrollments/${id}/reset-progress`, {
      method: "PATCH",
      body: JSON.stringify({ target }),
      accessToken,
    }),
  // --- Finanzas ---
  financialSummary: (
    params: { from?: string; to?: string; period?: "last30d" | "lastYear" | "allTime" | "year"; year?: number } = {},
    accessToken?: string | null,
  ) => apiFetch<any>("/admin/finance/summary", { accessToken, query: params, cache: "no-store" }),
  // "Un botón de detalle para ver esas cifras... por categoría, diario/semanal/mensual/anual, o en fechas que se estime".
  financialDetail: (
    params: { from?: string; to?: string; groupBy: "day" | "week" | "month" | "year" },
    accessToken?: string | null,
  ) => apiFetch<any>("/admin/finance/detail", { accessToken, query: params, cache: "no-store" }),
  updateFeeSettings: (input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>("/admin/finance/fee-settings", { method: "PATCH", body: JSON.stringify(input), accessToken }),
  expenses: (params: { from?: string; to?: string } = {}, accessToken?: string | null) =>
    apiFetch<any[]>("/admin/finance/expenses", { accessToken, query: params, cache: "no-store" }),
  createExpense: (
    input: { description: string; amount: number; currency?: string; category?: string; incurredAt?: string; recurrence?: string },
    accessToken?: string | null,
  ) => apiFetch<any>("/admin/finance/expenses", { method: "POST", body: JSON.stringify(input), accessToken }),
  deleteExpense: (id: string, accessToken?: string | null) =>
    apiFetch<{ deleted: boolean }>(`/admin/finance/expenses/${id}`, { method: "DELETE", accessToken }),
  // Descarga binaria — no pasa por apiFetch (que espera JSON) — arma un blob
  // en el cliente con el mismo header de autorización.
  downloadFinancialReportPdf: async (
    params: { from?: string; to?: string; period?: string; year?: number; months?: number },
    accessToken: string,
  ) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]).toString();
    const res = await fetch(`${API_URL}/admin/finance/report.pdf?${query}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new ApiError(res.status, "No pudimos generar el PDF.");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "inkademy-finanzas.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  emailFinancialReport: (
    input: { recipientEmail: string; from?: string; to?: string; period?: string; year?: number; months?: number },
    accessToken?: string | null,
  ) => apiFetch<{ sent: boolean; to: string }>("/admin/finance/report/email", { method: "POST", body: JSON.stringify(input), accessToken }),
  // --- Centro de reportes PDF (alumnos, cursos, empresas, EEFF, etc.) ---
  reportsCatalog: (accessToken?: string | null) =>
    apiFetch<{ key: string; label: string; description: string }[]>("/admin/reports", { accessToken, cache: "no-store" }),
  downloadReportPdf: async (key: string, params: { from?: string; to?: string }, accessToken: string) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]).toString();
    const res = await fetch(`${API_URL}/admin/reports/${key}.pdf?${query}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new ApiError(res.status, "No pudimos generar el PDF.");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inkademy-${key}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  profitAndLoss: (months: number | undefined, accessToken?: string | null) =>
    apiFetch<any>("/admin/finance/profit-and-loss", { accessToken, query: { months }, cache: "no-store" }),
  pendingReview: (accessToken?: string | null) => apiFetch<any[]>("/admin/attempts/pending-review", { accessToken }),
  suspiciousAttempts: (accessToken?: string | null) => apiFetch<any[]>("/admin/attempts/suspicious", { accessToken }),
  gradeAnswer: (attemptId: string, answerId: string, input: { score: number; isCorrect: boolean }, accessToken?: string | null) =>
    apiFetch<any>(`/admin/attempts/${attemptId}/answers/${answerId}/grade`, {
      method: "POST",
      body: JSON.stringify(input),
      accessToken,
    }),
  // --- Exámenes "cualitativos" (archivo) pendientes de calificar ---
  pendingFileReviews: (accessToken?: string | null) => apiFetch<any[]>("/admin/attempts/pending-file-reviews", { accessToken }),
  gradeFileAttempt: (attemptId: string, input: { score: number; passed: boolean }, accessToken?: string | null) =>
    apiFetch<any>(`/admin/attempts/${attemptId}/grade-file`, { method: "POST", body: JSON.stringify(input), accessToken }),
  teacherGradingWorkload: (accessToken?: string | null) => apiFetch<any[]>("/admin/teacher-grading-workload", { accessToken, cache: "no-store" }),
  certificateTemplates: (accessToken?: string | null) => apiFetch<any[]>("/admin/certificate-templates", { accessToken }),
  createCertificateTemplate: (input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>("/admin/certificate-templates", { method: "POST", body: JSON.stringify(input), accessToken }),
  updateCertificateTemplate: (id: string, input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>(`/admin/certificate-templates/${id}`, { method: "PATCH", body: JSON.stringify(input), accessToken }),
  deleteCertificateTemplate: (id: string, accessToken?: string | null) =>
    apiFetch<{ deleted: boolean }>(`/admin/certificate-templates/${id}`, { method: "DELETE", accessToken }),
  // --- Cortesías (historial de accesos gratuitos otorgados) ---
  courtesyGrants: (filters: { year?: number; courseId?: string; areaSlug?: string } = {}, accessToken?: string | null) =>
    apiFetch<any[]>("/admin/courtesy-grants", {
      accessToken,
      cache: "no-store",
      query: { year: filters.year?.toString(), courseId: filters.courseId, areaSlug: filters.areaSlug },
    }),
  deleteCourtesyGrants: (ids: string[], accessToken?: string | null) =>
    apiFetch<{ deleted: number }>("/admin/courtesy-grants", { method: "DELETE", body: JSON.stringify({ ids }), accessToken }),
  courseRatings: (filters: { courseId?: string } = {}, accessToken?: string | null) =>
    apiFetch<any>("/admin/course-ratings", { accessToken, cache: "no-store", query: { courseId: filters.courseId } }),
  // --- Convenios institucionales ---
  partnerInstitutions: (accessToken?: string | null) => apiFetch<any[]>("/admin/partner-institutions", { accessToken, cache: "no-store" }),
  createPartnerInstitution: (input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>("/admin/partner-institutions", { method: "POST", body: JSON.stringify(input), accessToken }),
  updatePartnerInstitution: (id: string, input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>(`/admin/partner-institutions/${id}`, { method: "PATCH", body: JSON.stringify(input), accessToken }),
  deletePartnerInstitution: (id: string, accessToken?: string | null) =>
    apiFetch<{ deleted: boolean }>(`/admin/partner-institutions/${id}`, { method: "DELETE", accessToken }),
  addCoursePartnership: (
    partnerInstitutionId: string,
    input: { courseId: string; startDate?: string; endDate?: string },
    accessToken?: string | null,
  ) => apiFetch<any>(`/admin/partner-institutions/${partnerInstitutionId}/courses`, { method: "POST", body: JSON.stringify(input), accessToken }),
  removeCoursePartnership: (id: string, accessToken?: string | null) =>
    apiFetch<{ deleted: boolean }>(`/admin/partner-institutions/course-partnerships/${id}`, { method: "DELETE", accessToken }),
  // "Los convenios se pueden renovar, extender su plazo" — actualiza el rango de fechas ya asignado.
  updateCoursePartnership: (id: string, input: { startDate?: string | null; endDate?: string | null }, accessToken?: string | null) =>
    apiFetch<any>(`/admin/partner-institutions/course-partnerships/${id}`, { method: "PATCH", body: JSON.stringify(input), accessToken }),
  // --- Reporte de horas dictadas (conexión/desconexión en clases en vivo) ---
  teacherSessionHours: (
    params: { teacherId?: string; courseId?: string; from?: string; to?: string } = {},
    accessToken?: string | null,
  ) => apiFetch<any>("/admin/teacher-session-hours", { accessToken, query: params, cache: "no-store" }),
  // --- Liquidación de docentes ---
  teacherRates: (teacherId?: string, accessToken?: string | null) =>
    apiFetch<any[]>("/admin/teacher-rates", { accessToken, query: teacherId ? { teacherId } : undefined, cache: "no-store" }),
  upsertTeacherRate: (input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>("/admin/teacher-rates", { method: "POST", body: JSON.stringify(input), accessToken }),
  deleteTeacherRate: (id: string, accessToken?: string | null) =>
    apiFetch<{ deleted: boolean }>(`/admin/teacher-rates/${id}`, { method: "DELETE", accessToken }),
  teacherActivityLogs: (teacherId: string, accessToken?: string | null) =>
    apiFetch<any[]>("/admin/teacher-activity-logs", { accessToken, query: { teacherId }, cache: "no-store" }),
  createTeacherActivityLog: (input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>("/admin/teacher-activity-logs", { method: "POST", body: JSON.stringify(input), accessToken }),
  deleteTeacherActivityLog: (id: string, accessToken?: string | null) =>
    apiFetch<{ deleted: boolean }>(`/admin/teacher-activity-logs/${id}`, { method: "DELETE", accessToken }),
  teacherAdvances: (teacherId: string, accessToken?: string | null) =>
    apiFetch<any[]>("/admin/teacher-advances", { accessToken, query: { teacherId }, cache: "no-store" }),
  createTeacherAdvance: (input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>("/admin/teacher-advances", { method: "POST", body: JSON.stringify(input), accessToken }),
  deleteTeacherAdvance: (id: string, accessToken?: string | null) =>
    apiFetch<{ deleted: boolean }>(`/admin/teacher-advances/${id}`, { method: "DELETE", accessToken }),
  teacherLiquidations: (teacherId?: string, accessToken?: string | null) =>
    apiFetch<any[]>("/admin/teacher-liquidations", { accessToken, query: teacherId ? { teacherId } : undefined, cache: "no-store" }),
  myTeacherLiquidations: (accessToken?: string | null) =>
    apiFetch<any[]>("/admin/teacher-liquidations/mine", { accessToken, cache: "no-store" }),
  generateTeacherLiquidation: (input: { teacherId: string; periodStart: string; periodEnd: string }, accessToken?: string | null) =>
    apiFetch<any>("/admin/teacher-liquidations/generate", { method: "POST", body: JSON.stringify(input), accessToken }),
  waiveTeacherLiquidation: (id: string, reason: string, accessToken?: string | null) =>
    apiFetch<any>(`/admin/teacher-liquidations/${id}/waive`, { method: "PATCH", body: JSON.stringify({ reason }), accessToken }),
  updateTeacherLiquidationStatus: (id: string, status: "APPROVED" | "PAID", accessToken?: string | null) =>
    apiFetch<any>(`/admin/teacher-liquidations/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }), accessToken }),
  // --- Regalías ---
  royaltyRecipients: (accessToken?: string | null) => apiFetch<any[]>("/admin/royalty-recipients", { accessToken, cache: "no-store" }),
  createRoyaltyRecipient: (input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>("/admin/royalty-recipients", { method: "POST", body: JSON.stringify(input), accessToken }),
  updateRoyaltyRecipient: (id: string, input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>(`/admin/royalty-recipients/${id}`, { method: "PATCH", body: JSON.stringify(input), accessToken }),
  deleteRoyaltyRecipient: (id: string, accessToken?: string | null) =>
    apiFetch<{ deleted: boolean }>(`/admin/royalty-recipients/${id}`, { method: "DELETE", accessToken }),
  addCourseRoyalty: (royaltyRecipientId: string, input: { courseId: string; startDate?: string; endDate?: string }, accessToken?: string | null) =>
    apiFetch<any>(`/admin/royalty-recipients/${royaltyRecipientId}/courses`, { method: "POST", body: JSON.stringify(input), accessToken }),
  removeCourseRoyalty: (id: string, accessToken?: string | null) =>
    apiFetch<{ deleted: boolean }>(`/admin/royalty-recipients/course-royalties/${id}`, { method: "DELETE", accessToken }),
  companies: (accessToken?: string | null) => apiFetch<any[]>("/admin/companies", { accessToken }),
  // --- Pipeline comercial (cotizaciones B2B) ---
  quotes: (accessToken?: string | null) => apiFetch<any[]>("/admin/quotes", { accessToken, cache: "no-store" }),
  respondToQuote: (id: string, input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>(`/admin/quotes/${id}/respond`, { method: "PATCH", body: JSON.stringify(input), accessToken }),
  convertQuote: (id: string, accessToken?: string | null) =>
    apiFetch<any>(`/admin/quotes/${id}/convert`, { method: "POST", accessToken }),

  // --- Catálogo: crear/editar cursos ---
  createCourse: (input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>("/admin/courses", { method: "POST", body: JSON.stringify(input), accessToken }),
  updateCourse: (id: string, input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>(`/admin/courses/${id}`, { method: "PATCH", body: JSON.stringify(input), accessToken }),
  // "Secciones adicionales de la ficha" y otros cambios recién guardados no
  // aparecían al recargar /admin/catalogo/:id — Next.js cachea GET por
  // defecto en Server Components salvo que se pida explícitamente lo
  // contrario (como sí hace el resto de este archivo); a este endpoint se
  // le había quedado sin `cache: "no-store"`.
  courseDetail: (id: string, accessToken?: string | null) => apiFetch<any>(`/admin/courses/${id}`, { accessToken, cache: "no-store" }),
  approvalRule: (courseId: string, accessToken?: string | null) => apiFetch<any>(`/admin/courses/${courseId}/approval-rule`, { accessToken }),
  // "El docente al final debería poder visualizar/descargar la lista de los inscritos y su reporte de asistencia"
  attendanceReport: (courseId: string, accessToken?: string | null) =>
    apiFetch<any>(`/admin/courses/${courseId}/attendance-report`, { accessToken, cache: "no-store" }),
  updateApprovalRule: (courseId: string, input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>(`/admin/courses/${courseId}/approval-rule`, { method: "PATCH", body: JSON.stringify(input), accessToken }),

  // --- Contenido: módulos / lecciones / materiales ---
  createModule: (courseId: string, input: { title: Record<string, string>; order?: number }, accessToken?: string | null) =>
    apiFetch<any>(`/admin/courses/${courseId}/modules`, { method: "POST", body: JSON.stringify(input), accessToken }),
  updateModule: (id: string, input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>(`/admin/modules/${id}`, { method: "PATCH", body: JSON.stringify(input), accessToken }),
  deleteModule: (id: string, accessToken?: string | null) =>
    apiFetch<any>(`/admin/modules/${id}`, { method: "DELETE", accessToken }),
  // "No hay ninguna forma de reordenar módulos" — drag-and-drop, mismo patrón que reorderQuestions.
  reorderModules: (courseId: string, orderedModuleIds: string[], accessToken?: string | null) =>
    apiFetch<any>(`/admin/courses/${courseId}/modules/reorder`, { method: "PATCH", body: JSON.stringify({ orderedModuleIds }), accessToken }),
  createLesson: (moduleId: string, input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>(`/admin/modules/${moduleId}/lessons`, { method: "POST", body: JSON.stringify(input), accessToken }),
  updateLesson: (id: string, input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>(`/admin/lessons/${id}`, { method: "PATCH", body: JSON.stringify(input), accessToken }),
  deleteLesson: (id: string, accessToken?: string | null) =>
    apiFetch<any>(`/admin/lessons/${id}`, { method: "DELETE", accessToken }),
  generateSubtitles: (id: string, accessToken?: string | null) =>
    apiFetch<{ queued: boolean }>(`/admin/lessons/${id}/generate-subtitles`, { method: "POST", accessToken }),
  uploadScormPackage: (lessonId: string, file: File, accessToken?: string | null) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<any>(`/admin/lessons/${lessonId}/scorm-upload`, { method: "POST", body: form, accessToken });
  },
  // Editor de autoría SCORM (armar el paquete desde Inkademy, sin subir ningún .zip) — ver ScormBuilder.tsx.
  buildScormPackage: (lessonId: string, content: { slides: unknown[]; passingScore: number }, accessToken?: string | null) =>
    apiFetch<{ entryPath: string; version: string }>(`/admin/lessons/${lessonId}/scorm/build`, { method: "POST", body: JSON.stringify(content), accessToken }),
  scormPreviewSession: (lessonId: string, accessToken?: string | null) =>
    apiFetch<{ token: string; playerUrl: string }>(`/admin/lessons/${lessonId}/scorm/preview-session`, { method: "POST", accessToken }),
  // Descarga binaria — no pasa por apiFetch (mismo criterio que downloadReportPdf).
  downloadScormPackage: async (lessonId: string, accessToken: string) => {
    const res = await fetch(`${API_URL}/admin/lessons/${lessonId}/scorm/export`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new ApiError(res.status, "No pudimos generar el paquete SCORM.");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scorm-${lessonId}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  createMaterial: (
    lessonId: string,
    input: { title: string; assetId?: string; externalUrl?: string; kind: string; category?: "MAIN" | "SUPPLEMENTARY"; visible?: boolean },
    accessToken?: string | null,
  ) => apiFetch<any>(`/admin/lessons/${lessonId}/materials`, { method: "POST", body: JSON.stringify(input), accessToken }),
  createModuleMaterial: (
    moduleId: string,
    input: { title: string; assetId?: string; externalUrl?: string; kind: string; category?: "MAIN" | "SUPPLEMENTARY"; visible?: boolean },
    accessToken?: string | null,
  ) => apiFetch<any>(`/admin/modules/${moduleId}/materials`, { method: "POST", body: JSON.stringify(input), accessToken }),
  updateMaterial: (
    id: string,
    input: Partial<{ title: string; category: "MAIN" | "SUPPLEMENTARY"; visible: boolean; allowDownload: boolean; allowView: boolean }>,
    accessToken?: string | null,
  ) => apiFetch<any>(`/admin/materials/${id}`, { method: "PATCH", body: JSON.stringify(input), accessToken }),
  deleteMaterial: (id: string, accessToken?: string | null) =>
    apiFetch<any>(`/admin/materials/${id}`, { method: "DELETE", accessToken }),
  reorderMaterial: (id: string, direction: "up" | "down", accessToken?: string | null) =>
    apiFetch<any>(`/admin/materials/${id}/reorder`, { method: "PATCH", body: JSON.stringify({ direction }), accessToken }),
  uploadAsset: (file: File, accessToken?: string | null) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<{ assetId: string; url: string }>("/admin/uploads", { method: "POST", body: form, accessToken });
  },

  // --- Evaluaciones (exámenes/quizzes) y preguntas ---
  assessments: (courseId: string, includeArchived?: boolean, accessToken?: string | null) =>
    apiFetch<any[]>(`/admin/courses/${courseId}/assessments`, { query: { includeArchived: includeArchived ? "true" : undefined }, accessToken }),
  createAssessment: (courseId: string, input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>(`/admin/courses/${courseId}/assessments`, { method: "POST", body: JSON.stringify(input), accessToken }),
  updateAssessment: (id: string, input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>(`/admin/assessments/${id}`, { method: "PATCH", body: JSON.stringify(input), accessToken }),
  deleteAssessment: (id: string, accessToken?: string | null) =>
    apiFetch<any>(`/admin/assessments/${id}`, { method: "DELETE", accessToken }),
  createQuestion: (assessmentId: string, input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>(`/admin/assessments/${assessmentId}/questions`, { method: "POST", body: JSON.stringify(input), accessToken }),
  updateQuestion: (id: string, input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>(`/admin/questions/${id}`, { method: "PATCH", body: JSON.stringify(input), accessToken }),
  deleteQuestion: (id: string, accessToken?: string | null) =>
    apiFetch<any>(`/admin/questions/${id}`, { method: "DELETE", accessToken }),
  // Drag-and-drop del builder de exámenes — reemplaza el orden de TODAS las preguntas del examen.
  // "¿Hay posibilidad de tener una plantilla en Excel?" — descarga binaria,
  // mismo patrón que downloadReportPdf (arma el blob en el cliente con el
  // token del propio navegador, ya que este botón vive en un componente de
  // cliente sin accessToken explícito propagado).
  downloadQuestionsTemplate: async (assessmentId: string) => {
    const token = getClientAccessToken();
    const res = await fetch(`${API_URL}/admin/assessments/${assessmentId}/questions/template.xlsx`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) throw new ApiError(res.status, "No pudimos generar la plantilla.");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla-preguntas.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  importQuestions: (assessmentId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<{ created: number; errors: { row: number; message: string }[] }>(
      `/admin/assessments/${assessmentId}/questions/import`,
      { method: "POST", body: form },
    );
  },
  reorderQuestions: (assessmentId: string, orderedQuestionIds: string[], accessToken?: string | null) =>
    apiFetch<any>(`/admin/assessments/${assessmentId}/questions/reorder`, {
      method: "PATCH",
      body: JSON.stringify({ orderedQuestionIds }),
      accessToken,
    }),
  // "No drag and drop... más tedioso" — reordenar los exámenes de un curso.
  reorderAssessments: (courseId: string, orderedAssessmentIds: string[], accessToken?: string | null) =>
    apiFetch<any>(`/admin/courses/${courseId}/assessments/reorder`, {
      method: "PATCH",
      body: JSON.stringify({ orderedAssessmentIds }),
      accessToken,
    }),

  // --- Usuarios y roles ---
  users: (params: { q?: string; role?: string; pageSize?: number } = {}, accessToken?: string | null) =>
    apiFetch<any[]>("/admin/users", { query: params, accessToken, cache: "no-store" }),
  createUser: (
    input: { email: string; firstName: string; lastName: string; globalRole: string; password?: string },
    accessToken?: string | null,
  ) => apiFetch<any>("/admin/users", { method: "POST", body: JSON.stringify(input), accessToken }),
  updateUser: (
    id: string,
    input: {
      globalRole?: string;
      secondaryRoles?: string[];
      status?: string;
      signatureAssetId?: string | null;
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string | null;
      documentType?: string | null;
      documentNumber?: string | null;
      country?: string | null;
      city?: string | null;
      address?: string | null;
      jobTitle?: string | null;
      companyFreeText?: string | null;
      avatarUrl?: string | null;
    },
    accessToken?: string | null,
  ) => apiFetch<any>(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(input), accessToken }),
  resetUserPassword: (id: string, password: string | undefined, accessToken?: string | null) =>
    apiFetch<{ id: string; email: string; tempPassword: string | null }>(`/admin/users/${id}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ password }),
      accessToken,
    }),
  deleteUser: (id: string, accessToken?: string | null) =>
    apiFetch<{ deleted: boolean }>(`/admin/users/${id}`, { method: "DELETE", accessToken }),

  // --- Zona de pruebas: borrado en lote (solo ADMIN) ---
  bulkDeleteUsers: (ids: string[], accessToken?: string | null) =>
    apiFetch<BulkDeleteResult>("/admin/zona-de-pruebas/users/bulk-delete", { method: "POST", body: JSON.stringify({ ids }), accessToken }),
  bulkDeleteCourses: (ids: string[], accessToken?: string | null) =>
    apiFetch<BulkDeleteResult>("/admin/zona-de-pruebas/courses/bulk-delete", { method: "POST", body: JSON.stringify({ ids }), accessToken }),
  bulkDeleteAreas: (ids: string[], accessToken?: string | null) =>
    apiFetch<BulkDeleteResult>("/admin/zona-de-pruebas/areas/bulk-delete", { method: "POST", body: JSON.stringify({ ids }), accessToken }),
  bulkDeleteCompanies: (ids: string[], accessToken?: string | null) =>
    apiFetch<BulkDeleteResult>("/admin/zona-de-pruebas/companies/bulk-delete", { method: "POST", body: JSON.stringify({ ids }), accessToken }),

  // --- Docentes asignados a un curso ---
  courseStaff: (courseId: string, accessToken?: string | null) =>
    apiFetch<any[]>(`/admin/courses/${courseId}/staff`, { accessToken }),
  assignCourseStaff: (courseId: string, input: { email: string; role: string }, accessToken?: string | null) =>
    apiFetch<any>(`/admin/courses/${courseId}/staff`, { method: "POST", body: JSON.stringify(input), accessToken }),
  removeCourseStaff: (id: string, accessToken?: string | null) =>
    apiFetch<any>(`/admin/course-staff/${id}`, { method: "DELETE", accessToken }),
  // "El administrador podría también bloquearle esos accesos [de edición]" — sin desasignar al docente del curso.
  setCourseStaffCanEdit: (id: string, canEdit: boolean) =>
    apiFetch<any>(`/admin/course-staff/${id}/can-edit`, { method: "PATCH", body: JSON.stringify({ canEdit }) }),

  // --- Apariencia de la plataforma ---
  updateSettings: (input: Partial<Omit<PlatformSettingsDTO, "id">>, accessToken?: string | null) =>
    apiFetch<PlatformSettingsDTO>("/admin/settings", { method: "PATCH", body: JSON.stringify(input), accessToken }),

  // --- Facturación electrónica SUNAT (los secretos nunca vuelven en texto plano) ---
  sunatSettings: (accessToken?: string | null) => apiFetch<SunatSettingsDTO>("/admin/sunat-settings", { accessToken, cache: "no-store" }),
  updateSunatSettings: (input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<SunatSettingsDTO>("/admin/sunat-settings", { method: "PATCH", body: JSON.stringify(input), accessToken }),
  chatbotSettings: (accessToken?: string | null) => apiFetch<ChatbotSettingsDTO>("/admin/chatbot-settings", { accessToken, cache: "no-store" }),
  updateChatbotSettings: (input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<ChatbotSettingsDTO>("/admin/chatbot-settings", { method: "PATCH", body: JSON.stringify(input), accessToken }),
  chatbotDocuments: (accessToken?: string | null) =>
    apiFetch<any[]>("/admin/chatbot-documents", { accessToken, cache: "no-store" }),
  uploadChatbotDocument: (file: File, title: string | undefined, accessToken?: string | null) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<{ id: string; title: string; charCount: number }>("/admin/chatbot-documents", {
      method: "POST",
      body: form,
      accessToken,
      query: title ? { title } : undefined,
    });
  },
  updateChatbotDocument: (id: string, input: { active?: boolean }, accessToken?: string | null) =>
    apiFetch<any>(`/admin/chatbot-documents/${id}`, { method: "PATCH", body: JSON.stringify(input), accessToken }),
  deleteChatbotDocument: (id: string, accessToken?: string | null) =>
    apiFetch<{ deleted: boolean }>(`/admin/chatbot-documents/${id}`, { method: "DELETE", accessToken }),

  // --- Servidor de correo (SMTP) — la contraseña nunca vuelve en texto plano ---
  emailServerSettings: (accessToken?: string | null) =>
    apiFetch<EmailServerSettingsDTO>("/admin/email-server-settings", { accessToken, cache: "no-store" }),
  updateEmailServerSettings: (input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<EmailServerSettingsDTO>("/admin/email-server-settings", { method: "PATCH", body: JSON.stringify(input), accessToken }),

  // --- Campañas de correo a clientes ---
  emailCampaigns: (accessToken?: string | null) =>
    apiFetch<EmailCampaignDTO[]>("/admin/email-campaigns", { accessToken, cache: "no-store" }),
  createEmailCampaign: (input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<EmailCampaignDTO>("/admin/email-campaigns", { method: "POST", body: JSON.stringify(input), accessToken }),
  updateEmailCampaign: (id: string, input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<EmailCampaignDTO>(`/admin/email-campaigns/${id}`, { method: "PATCH", body: JSON.stringify(input), accessToken }),
  sendEmailCampaignNow: (id: string, accessToken?: string | null) =>
    apiFetch<EmailCampaignDTO>(`/admin/email-campaigns/${id}/send-now`, { method: "POST", accessToken }),
  deleteEmailCampaign: (id: string, accessToken?: string | null) =>
    apiFetch<{ deleted: boolean }>(`/admin/email-campaigns/${id}`, { method: "DELETE", accessToken }),
  previewEmailAudience: (filter: EmailAudienceFilter, accessToken?: string | null) =>
    apiFetch<{ count: number }>("/admin/email-campaigns/audience-preview", { method: "POST", body: JSON.stringify(filter), accessToken }),
};

// ---------------------------------------------------------------------------
// Encuesta NPS B2B (Fase 2) — pregunta única, envío por empresa, respuesta
// pública vía token (sin login, ver /encuesta/[token]).
// ---------------------------------------------------------------------------
export interface NpsCompanyRow {
  id: string;
  legalName: string;
  lastSentAt: string | null;
  lastRespondedAt: string | null;
  lastScore: number | null;
}
export interface NpsResultsDTO {
  npsScore: number | null;
  totalResponses: number;
  promoters: number;
  passives: number;
  detractors: number;
  responses: { id: string; companyId: string; companyName: string; score: number | null; comment: string | null; respondedAt: string | null }[];
}

export const npsAdminApi = {
  question: (accessToken?: string | null) =>
    apiFetch<{ question: Record<string, string>; commentPrompt: Record<string, string>; active: boolean; updatedAt: string | null }>(
      "/admin/nps/question",
      { accessToken, cache: "no-store" },
    ),
  updateQuestion: (input: { question?: Record<string, string>; commentPrompt?: Record<string, string> }, accessToken?: string | null) =>
    apiFetch<{ question: Record<string, string>; commentPrompt: Record<string, string>; active: boolean }>("/admin/nps/question", {
      method: "PUT",
      body: JSON.stringify(input),
      accessToken,
    }),
  companies: (accessToken?: string | null) => apiFetch<NpsCompanyRow[]>("/admin/nps/companies", { accessToken, cache: "no-store" }),
  // "La opción de previsualizar cómo será el correo" — arma el HTML real sin enviarlo.
  emailPreview: (accessToken?: string | null) => apiFetch<{ html: string }>("/admin/nps/email-preview", { accessToken, cache: "no-store" }),
  send: (companyId: string, accessToken?: string | null) =>
    apiFetch<{ sent: boolean; sentToEmail: string }>(`/admin/nps/send/${companyId}`, { method: "POST", accessToken }),
  results: (companyId?: string, accessToken?: string | null) =>
    apiFetch<NpsResultsDTO>("/admin/nps/responses", { accessToken, query: companyId ? { companyId } : undefined, cache: "no-store" }),
};

export const npsPublicApi = {
  get: (token: string) =>
    apiFetch<{ companyName: string; question: Record<string, string>; commentPrompt: Record<string, string>; alreadyResponded: boolean }>(
      `/nps/${token}`,
    ),
  submit: (token: string, score: number, comment?: string) =>
    apiFetch<{ saved: boolean }>(`/nps/${token}`, { method: "POST", body: JSON.stringify({ score, comment }) }),
};

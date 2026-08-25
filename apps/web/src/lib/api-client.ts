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
}

export const authApi = {
  register: (input: unknown) => apiFetch<{ user: AuthUser; accessToken: string }>("/auth/register", { method: "POST", body: JSON.stringify(input) }),
  login: (input: unknown) => apiFetch<{ user: AuthUser; accessToken: string }>("/auth/login", { method: "POST", body: JSON.stringify(input) }),
  logout: () => apiFetch<void>("/auth/logout", { method: "POST" }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch<void>("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
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
export interface CourseCardFields {
  showTeacher: boolean;
  showDuration: boolean;
  showNextLiveSession: boolean;
  showCertificationBadge: boolean;
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
  updatedAt: string | null;
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
    apiFetch<void>(`/me/lessons/${lessonId}/progress`, { method: "PATCH", body: JSON.stringify(input) }),
  calendar: (from?: string, to?: string, accessToken?: string | null) =>
    apiFetch<any[]>("/me/calendar", { query: { from, to }, accessToken }),
  certificates: (accessToken?: string | null) => apiFetch<CertificateDTO[]>("/me/certificates", { accessToken }),
  recommendations: (accessToken?: string | null) => apiFetch<CourseCardDTO[]>("/me/recommendations", { accessToken }),
  orders: (accessToken?: string | null) => apiFetch<any[]>("/me/orders", { accessToken }),
};

// ---------------------------------------------------------------------------
// Checkout / comercio
// ---------------------------------------------------------------------------
export const commerceApi = {
  checkout: (input: CheckoutRequest) => apiFetch<CheckoutResult>("/checkout", { method: "POST", body: JSON.stringify(input) }),
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
};

// ---------------------------------------------------------------------------
// Evaluación
// ---------------------------------------------------------------------------
export const assessmentApi = {
  get: (id: string) => apiFetch<any>(`/assessments/${id}`),
  createAttempt: (assessmentId: string) => apiFetch<any>(`/assessments/${assessmentId}/attempts`, { method: "POST" }),
  submit: (attemptId: string, input: unknown) =>
    apiFetch<AssessmentResultDTO>(`/attempts/${attemptId}/submit`, { method: "POST", body: JSON.stringify(input) }),
  attempt: (id: string) => apiFetch<any>(`/attempts/${id}`),
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
};

// ---------------------------------------------------------------------------
// Aula virtual
// ---------------------------------------------------------------------------
export const liveSessionApi = {
  join: (id: string) => apiFetch<{ joinUrl: string; role: string }>(`/live-sessions/${id}/join`),
  create: (
    input: { courseId: string; title?: string; startsAt: string; endsAt: string; timezone?: string; capacity?: number },
    accessToken?: string | null,
  ) => apiFetch<any>("/live-sessions", { method: "POST", body: JSON.stringify(input), accessToken }),
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
  assignSeat: (id: string, poolId: string, userId: string, accessToken?: string | null) =>
    apiFetch<any>(`/companies/${id}/seat-pools/${poolId}/assign`, { method: "POST", body: JSON.stringify({ userId }), accessToken }),
  renewSeatPool: (id: string, poolId: string, months: number, accessToken?: string | null) =>
    apiFetch<any>(`/companies/${id}/seat-pools/${poolId}/renew`, { method: "PATCH", body: JSON.stringify({ months }), accessToken }),
  reports: (id: string, query: Record<string, string | undefined> = {}, accessToken?: string | null) =>
    apiFetch<any>(`/companies/${id}/reports`, { query, accessToken }),
  requestQuote: (id: string, input: unknown, accessToken?: string | null) =>
    apiFetch<any>(`/companies/${id}/quotes`, { method: "POST", body: JSON.stringify(input), accessToken }),
  quotes: (id: string, accessToken?: string | null) => apiFetch<any[]>(`/companies/${id}/quotes`, { accessToken }),
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
};

// ---------------------------------------------------------------------------
// Sugerencias ("me gustaría un curso de...")
// ---------------------------------------------------------------------------
export const suggestionsApi = {
  create: (message: string, accessToken?: string | null) =>
    apiFetch<any>("/suggestions", { method: "POST", body: JSON.stringify({ message }), accessToken }),
  mine: (accessToken?: string | null) => apiFetch<any[]>("/suggestions/mine", { accessToken }),
  all: (accessToken?: string | null) => apiFetch<any[]>("/suggestions", { accessToken }),
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
  courses: (accessToken?: string | null) => apiFetch<any[]>("/admin/courses", { accessToken }),
  // Panel de docente: cursos asignados, próximas clases a dictar, cola de calificación — ver AdminService.getTeacherDashboard.
  teacherDashboard: (accessToken?: string | null) => apiFetch<any>("/admin/my-courses", { accessToken }),
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
  orders: (q: string | undefined, accessToken?: string | null) =>
    apiFetch<any[]>("/admin/orders", { accessToken, query: q ? { q } : undefined }),
  // --- Matrículas: ampliar plazo de acceso como caso especial ---
  enrollments: (q: string | undefined, accessToken?: string | null) =>
    apiFetch<any[]>("/admin/enrollments", { accessToken, query: q ? { q } : undefined, cache: "no-store" }),
  extendEnrollmentAccess: (id: string, accessExpiresAt: string | null, accessToken?: string | null) =>
    apiFetch<any>(`/admin/enrollments/${id}/extend-access`, {
      method: "PATCH",
      body: JSON.stringify({ accessExpiresAt }),
      accessToken,
    }),
  pendingReview: (accessToken?: string | null) => apiFetch<any[]>("/admin/attempts/pending-review", { accessToken }),
  suspiciousAttempts: (accessToken?: string | null) => apiFetch<any[]>("/admin/attempts/suspicious", { accessToken }),
  gradeAnswer: (attemptId: string, answerId: string, input: { score: number; isCorrect: boolean }, accessToken?: string | null) =>
    apiFetch<any>(`/admin/attempts/${attemptId}/answers/${answerId}/grade`, {
      method: "POST",
      body: JSON.stringify(input),
      accessToken,
    }),
  certificateTemplates: (accessToken?: string | null) => apiFetch<any[]>("/admin/certificate-templates", { accessToken }),
  createCertificateTemplate: (input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>("/admin/certificate-templates", { method: "POST", body: JSON.stringify(input), accessToken }),
  updateCertificateTemplate: (id: string, input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>(`/admin/certificate-templates/${id}`, { method: "PATCH", body: JSON.stringify(input), accessToken }),
  companies: (accessToken?: string | null) => apiFetch<any[]>("/admin/companies", { accessToken }),

  // --- Catálogo: crear/editar cursos ---
  createCourse: (input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>("/admin/courses", { method: "POST", body: JSON.stringify(input), accessToken }),
  updateCourse: (id: string, input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>(`/admin/courses/${id}`, { method: "PATCH", body: JSON.stringify(input), accessToken }),
  courseDetail: (id: string, accessToken?: string | null) => apiFetch<any>(`/admin/courses/${id}`, { accessToken }),

  // --- Contenido: módulos / lecciones / materiales ---
  createModule: (courseId: string, input: { title: Record<string, string>; order?: number }, accessToken?: string | null) =>
    apiFetch<any>(`/admin/courses/${courseId}/modules`, { method: "POST", body: JSON.stringify(input), accessToken }),
  updateModule: (id: string, input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>(`/admin/modules/${id}`, { method: "PATCH", body: JSON.stringify(input), accessToken }),
  deleteModule: (id: string, accessToken?: string | null) =>
    apiFetch<any>(`/admin/modules/${id}`, { method: "DELETE", accessToken }),
  createLesson: (moduleId: string, input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>(`/admin/modules/${moduleId}/lessons`, { method: "POST", body: JSON.stringify(input), accessToken }),
  updateLesson: (id: string, input: Record<string, unknown>, accessToken?: string | null) =>
    apiFetch<any>(`/admin/lessons/${id}`, { method: "PATCH", body: JSON.stringify(input), accessToken }),
  deleteLesson: (id: string, accessToken?: string | null) =>
    apiFetch<any>(`/admin/lessons/${id}`, { method: "DELETE", accessToken }),
  createMaterial: (
    lessonId: string,
    input: { title: string; assetId: string; kind: string; category?: "MAIN" | "SUPPLEMENTARY"; visible?: boolean },
    accessToken?: string | null,
  ) => apiFetch<any>(`/admin/lessons/${lessonId}/materials`, { method: "POST", body: JSON.stringify(input), accessToken }),
  createModuleMaterial: (
    moduleId: string,
    input: { title: string; assetId: string; kind: string; category?: "MAIN" | "SUPPLEMENTARY"; visible?: boolean },
    accessToken?: string | null,
  ) => apiFetch<any>(`/admin/modules/${moduleId}/materials`, { method: "POST", body: JSON.stringify(input), accessToken }),
  updateMaterial: (
    id: string,
    input: Partial<{ title: string; category: "MAIN" | "SUPPLEMENTARY"; visible: boolean }>,
    accessToken?: string | null,
  ) => apiFetch<any>(`/admin/materials/${id}`, { method: "PATCH", body: JSON.stringify(input), accessToken }),
  deleteMaterial: (id: string, accessToken?: string | null) =>
    apiFetch<any>(`/admin/materials/${id}`, { method: "DELETE", accessToken }),
  uploadAsset: (file: File, accessToken?: string | null) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<{ assetId: string; url: string }>("/admin/uploads", { method: "POST", body: form, accessToken });
  },

  // --- Evaluaciones (exámenes/quizzes) y preguntas ---
  assessments: (courseId: string, accessToken?: string | null) =>
    apiFetch<any[]>(`/admin/courses/${courseId}/assessments`, { accessToken }),
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

  // --- Usuarios y roles ---
  users: (params: { q?: string; role?: string } = {}, accessToken?: string | null) =>
    apiFetch<any[]>("/admin/users", { query: params, accessToken, cache: "no-store" }),
  createUser: (
    input: { email: string; firstName: string; lastName: string; globalRole: string; password?: string },
    accessToken?: string | null,
  ) => apiFetch<any>("/admin/users", { method: "POST", body: JSON.stringify(input), accessToken }),
  updateUser: (
    id: string,
    input: { globalRole?: string; status?: string; signatureAssetId?: string | null },
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

  // --- Docentes asignados a un curso ---
  courseStaff: (courseId: string, accessToken?: string | null) =>
    apiFetch<any[]>(`/admin/courses/${courseId}/staff`, { accessToken }),
  assignCourseStaff: (courseId: string, input: { email: string; role: string }, accessToken?: string | null) =>
    apiFetch<any>(`/admin/courses/${courseId}/staff`, { method: "POST", body: JSON.stringify(input), accessToken }),
  removeCourseStaff: (id: string, accessToken?: string | null) =>
    apiFetch<any>(`/admin/course-staff/${id}`, { method: "DELETE", accessToken }),

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
};

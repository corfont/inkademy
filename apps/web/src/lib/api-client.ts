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

async function tryRefresh(): Promise<string | null> {
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
export const authApi = {
  register: (input: unknown) => apiFetch<{ user: AuthUser; accessToken: string }>("/auth/register", { method: "POST", body: JSON.stringify(input) }),
  login: (input: unknown) => apiFetch<{ user: AuthUser; accessToken: string }>("/auth/login", { method: "POST", body: JSON.stringify(input) }),
  logout: () => apiFetch<void>("/auth/logout", { method: "POST" }),
  me: (accessToken?: string | null) => apiFetch<AuthUser>("/auth/me", { accessToken }),
  forgotPassword: (email: string) => apiFetch<void>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (input: { token: string; password: string }) => apiFetch<void>("/auth/reset-password", { method: "POST", body: JSON.stringify(input) }),
  completeProfile: (input: unknown, accessToken?: string | null) => apiFetch<AuthUser>("/profile", { method: "PATCH", body: JSON.stringify(input), accessToken }),
};

// ---------------------------------------------------------------------------
// Catálogo público
// ---------------------------------------------------------------------------
export const catalogApi = {
  areas: () => apiFetch<AreaSummary[]>("/areas"),
  courses: (filters: CatalogFilters = {}) =>
    apiFetch<{ items: CourseCardDTO[]; total: number; page: number; pageSize: number }>("/courses", { query: filters as Record<string, any> }),
  course: (slug: string) => apiFetch<CourseDetailDTO>(`/courses/${slug}`),
  program: (slug: string) => apiFetch<ProgramDetailDTO>(`/programs/${slug}`),
  sections: () =>
    apiFetch<{
      featured: CourseCardDTO[];
      upcomingLive: CourseCardDTO[];
      new: CourseCardDTO[];
      recommendedPaths: CourseCardDTO[];
      mostDemanded: CourseCardDTO[];
    }>("/catalog/sections"),
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
  order: (id: string) => apiFetch<any>(`/orders/${id}`),
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
    }>(`/certificates/verify/${code}`),
  pdfUrl: (id: string) => `${API_URL}/certificates/${id}/pdf`,
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
  assignSeat: (id: string, poolId: string, userId: string, accessToken?: string | null) =>
    apiFetch<any>(`/companies/${id}/seat-pools/${poolId}/assign`, { method: "POST", body: JSON.stringify({ userId }), accessToken }),
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
  createTicket: (input: unknown) => apiFetch<any>("/support/tickets", { method: "POST", body: JSON.stringify(input) }),
  tickets: (query: Record<string, string | undefined> = {}) => apiFetch<SupportTicketSummaryDTO[]>("/support/tickets", { query }),
  ticket: (id: string) => apiFetch<any>(`/support/tickets/${id}`),
  addMessage: (id: string, body: string) => apiFetch<any>(`/support/tickets/${id}/messages`, { method: "POST", body: JSON.stringify({ body }) }),
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export const adminApi = {
  kpis: (accessToken?: string | null) => apiFetch<any>("/admin/dashboard/kpis", { accessToken }),
  exceptions: (accessToken?: string | null) => apiFetch<AdminExceptionDTO[]>("/admin/exceptions", { accessToken }),
  courses: (accessToken?: string | null) => apiFetch<any[]>("/admin/courses", { accessToken }),
  programs: (accessToken?: string | null) => apiFetch<any[]>("/admin/programs", { accessToken }),
  areas: (accessToken?: string | null) => apiFetch<any[]>("/admin/areas", { accessToken }),
  pendingReview: (accessToken?: string | null) => apiFetch<any[]>("/admin/attempts/pending-review", { accessToken }),
  gradeAnswer: (attemptId: string, answerId: string, input: { score: number; isCorrect: boolean }, accessToken?: string | null) =>
    apiFetch<any>(`/admin/attempts/${attemptId}/answers/${answerId}/grade`, {
      method: "POST",
      body: JSON.stringify(input),
      accessToken,
    }),
  certificateTemplates: (accessToken?: string | null) => apiFetch<any[]>("/admin/certificate-templates", { accessToken }),
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
  createMaterial: (lessonId: string, input: { title: string; assetId: string; kind: string }, accessToken?: string | null) =>
    apiFetch<any>(`/admin/lessons/${lessonId}/materials`, { method: "POST", body: JSON.stringify(input), accessToken }),
  deleteMaterial: (id: string, accessToken?: string | null) =>
    apiFetch<any>(`/admin/materials/${id}`, { method: "DELETE", accessToken }),
  uploadAsset: (file: File, accessToken?: string | null) => {
    const form = new FormData();
    form.append("file", file);
    return apiFetch<{ assetId: string; url: string }>("/admin/uploads", { method: "POST", body: form, accessToken });
  },
};

/**
 * Módulos del panel de administración sobre los que se pueden dar permisos finos (rol de administrador acotado).
 * Un usuario sin rol acotado sigue siendo administrador completo; con uno, solo entra a lo que el rol permite.
 */
export const ADMIN_MODULES = [
  { key: "catalogo", label: "Catálogo y contenido", description: "Cursos, programas, evaluaciones, certificados y evaluaciones pendientes." },
  { key: "usuarios", label: "Usuarios y matrículas", description: "Usuarios, casos extemporáneos y cortesías." },
  { key: "comercial", label: "Ventas y empresas", description: "Empresas, cotizaciones, órdenes y licencias de arriendo." },
  { key: "finanzas", label: "Finanzas y pagos", description: "Finanzas, facturación SUNAT, regalías, convenios y liquidación de docentes." },
  { key: "marketing", label: "Marketing por correo", description: "Campañas y listas de correo." },
  { key: "soporte", label: "Soporte y comunicación", description: "Tickets, sugerencias, encuestas NPS y notificaciones." },
  { key: "reportes", label: "Reportes y calificaciones", description: "Reportes descargables y calificaciones de cursos." },
  { key: "sistema", label: "Configuración del sistema", description: "Apariencia, configuración avanzada, asistente de IA, backups, auditoría y zona de pruebas." },
] as const;

export type AdminModuleKey = (typeof ADMIN_MODULES)[number]["key"];
export type AdminPermissionLevel = "VIEW" | "EDIT";
export type AdminPermissions = Partial<Record<AdminModuleKey, AdminPermissionLevel>>;

/** Segmentos de la API (/admin/<segmento>) → módulo. `null` = abierto a cualquier administrador (p. ej. su propia agenda). */
const API_SEGMENT_MODULE: Record<string, AdminModuleKey | null> = {
  courses: "catalogo", lessons: "catalogo", materials: "catalogo", assessments: "catalogo", attempts: "catalogo", questions: "catalogo",
  modules: "catalogo", programs: "catalogo", areas: "catalogo", "certificate-templates": "catalogo", "scorm-theme-presets": "catalogo",
  "course-staff": "catalogo", "rating-dimensions": "reportes", uploads: "catalogo", translate: "catalogo",
  users: "usuarios", enrollments: "usuarios", "courtesy-grants": "usuarios",
  quotes: "comercial", "quote-leads": "comercial", companies: "comercial", orders: "comercial", licenses: "comercial",
  finance: "finanzas", "royalty-recipients": "finanzas", "partner-institutions": "finanzas", "teacher-liquidations": "finanzas",
  "teacher-rates": "finanzas", "teacher-advances": "finanzas", "teacher-session-hours": "finanzas", "teacher-activity-logs": "finanzas",
  "teacher-grading-workload": "finanzas", "sunat-settings": "finanzas",
  "email-campaigns": "marketing", "mailing-lists": "marketing",
  "chatbot-documents": "soporte", complaints: "soporte", nps: "soporte", notifications: "soporte", "notification-settings": "soporte",
  reports: "reportes", exceptions: "reportes", "course-ratings": "reportes",
  "zona-de-pruebas": "sistema", "audit-log": "sistema", settings: "sistema", "chatbot-settings": "sistema",
  "email-server-settings": "sistema",
  dashboard: null, "my-courses": null, "my-agenda": null,
};

/** Segmentos que solo puede usar un administrador completo (no uno con rol acotado): hoy, la gestión de los propios roles. */
const OWNER_ONLY_SEGMENTS = new Set(["admin-roles", "backups", "privacy-requests"]); // los respaldos contienen todos los secretos; ejecutar una eliminación de datos es irreversible

/** Rutas de staff que NO cuelgan de /admin pero mueven dinero o accesos: también respetan el rol acotado. */
const EXTRA_ROUTES: { pattern: RegExp; module: AdminModuleKey }[] = [
  { pattern: /^\/grants(\/|$)/, module: "usuarios" },
  { pattern: /^\/orders\/[^/]+\/cancel(-test)?$/, module: "comercial" },
];

/**
 * Módulo que protege una ruta de la API. Devuelve:
 * - `undefined` si la ruta no es del panel admin (no aplica),
 * - `null` si es de acceso abierto,
 * - `"__owner__"` si solo la puede usar un administrador completo,
 * - un módulo (las rutas /admin/* sin mapa explícito caen en "sistema": lo desconocido es lo más restringido).
 */
export function adminModuleForApiPath(path: string): AdminModuleKey | "__owner__" | null | undefined {
  // Express enruta sin distinguir mayúsculas ("/ADMIN/users" llega al mismo controlador): se normaliza antes de comparar y se colapsan las barras repetidas.
  const clean = path.split("?")[0].replace(/\/{2,}/g, "/").replace(/\/+$/, "").toLowerCase();
  for (const route of EXTRA_ROUTES) if (route.pattern.test(clean)) return route.module;
  const match = clean.match(/^\/admin\/([^/]+)/);
  if (!match) return undefined;
  const segment = match[1];
  if (OWNER_ONLY_SEGMENTS.has(segment)) return "__owner__";
  if (segment in API_SEGMENT_MODULE) return API_SEGMENT_MODULE[segment];
  return "sistema";
}

/** Página del panel (/admin/<página>) → módulo, para ocultar del menú lo que el rol no puede ver. */
const WEB_PAGE_MODULE: Record<string, AdminModuleKey | "__owner__"> = {
  catalogo: "catalogo", certificados: "catalogo", "evaluaciones-pendientes": "catalogo",
  usuarios: "usuarios", matriculas: "usuarios", cortesias: "usuarios",
  empresas: "comercial", cotizaciones: "comercial", ordenes: "comercial", licencias: "comercial",
  finanzas: "finanzas", facturacion: "finanzas", regalias: "finanzas", convenios: "finanzas", "horas-docentes": "finanzas", liquidaciones: "finanzas",
  marketing: "marketing",
  soporte: "soporte", reclamos: "soporte", sugerencias: "soporte", "encuestas-nps": "soporte", notificaciones: "soporte",
  reportes: "reportes", calificaciones: "reportes",
  apariencia: "sistema", "asistente-ia": "sistema", configuracion: "sistema", backups: "__owner__", auditoria: "sistema", "zona-de-pruebas": "sistema",
  roles: "__owner__", privacidad: "__owner__",
};

export function adminModuleForWebHref(href: string): AdminModuleKey | "__owner__" | null {
  const match = href.match(/^\/admin\/([^/?#]+)/);
  if (!match) return null; // "/admin" (inicio) y rutas fuera del panel
  return WEB_PAGE_MODULE[match[1]] ?? "sistema";
}

/** ¿Estos permisos alcanzan para la operación? Lectura pide VIEW o EDIT; cualquier cambio pide EDIT. */
export function adminPermissionAllows(permissions: AdminPermissions | null | undefined, module: AdminModuleKey, write: boolean): boolean {
  const level = permissions?.[module];
  if (!level) return false;
  return write ? level === "EDIT" : true;
}

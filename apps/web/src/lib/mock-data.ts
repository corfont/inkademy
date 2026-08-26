import type {
  AreaSummary,
  CourseCardDTO,
  CourseDetailDTO,
  ProgramDetailDTO,
  EnrollmentSummaryDTO,
  CertificateDTO,
  CompanyDashboardSummaryDTO,
  AdminExceptionDTO,
  SupportTicketSummaryDTO,
  LocalizedText,
} from "@inkademy/shared";

// Dataset simulado usado como fallback mientras apps/api no está disponible.
// Reutiliza los DTOs de @inkademy/shared para que el shape sea idéntico al
// que entregará la API real (docs/API-CONTRACT.md).

export const MOCK_AREAS: AreaSummary[] = [
  { id: "a1", slug: "gestion-liderazgo", name: { es: "Gestión y Liderazgo", en: "Management & Leadership" }, icon: "briefcase" },
  { id: "a2", slug: "finanzas-contabilidad", name: { es: "Finanzas y Contabilidad", en: "Finance & Accounting" }, icon: "coins" },
  { id: "a3", slug: "tecnologia-datos", name: { es: "Tecnología y Datos", en: "Technology & Data" }, icon: "cpu" },
  { id: "a4", slug: "marketing-ventas", name: { es: "Marketing y Ventas", en: "Marketing & Sales" }, icon: "megaphone" },
  { id: "a5", slug: "legal-cumplimiento", name: { es: "Legal y Cumplimiento", en: "Legal & Compliance" }, icon: "scale" },
  { id: "a6", slug: "salud-seguridad", name: { es: "Salud y Seguridad Ocupacional", en: "Health & Safety" }, icon: "shield" },
];

function course(partial: Partial<CourseCardDTO> & { id: string; slug: string; title: CourseCardDTO["title"] }): CourseCardDTO {
  return {
    subtitle: null,
    modality: "RECORDED",
    type: "COURSE",
    level: "INTERMEDIATE",
    areaSlug: "gestion-liderazgo",
    durationHours: 12,
    coverImageUrl: null,
    teacherName: null,
    nextLiveSessionAt: null,
    certificationIncluded: true,
    priceAmount: "349.00",
    priceCurrency: "PEN",
    b2bAvailable: true,
    ...partial,
  };
}

export const MOCK_COURSES: CourseCardDTO[] = [
  course({
    id: "c1",
    slug: "liderazgo-equipos-remotos",
    title: { es: "Liderazgo de equipos remotos", en: "Leading remote teams" },
    subtitle: { es: "Dirige con claridad a equipos distribuidos y eleva su desempeño", en: "Lead distributed teams with clarity" },
    areaSlug: "gestion-liderazgo",
    modality: "LIVE",
    level: "INTERMEDIATE",
    teacherName: "Marisol Aguirre",
    durationHours: 16,
    nextLiveSessionAt: "2026-09-08T23:00:00.000Z",
    priceAmount: "459.00",
  }),
  course({
    id: "c2",
    slug: "finanzas-para-no-financieros",
    title: { es: "Finanzas para no financieros", en: "Finance for non-financial managers" },
    subtitle: { es: "Lee estados financieros y toma mejores decisiones de negocio", en: "Read financial statements with confidence" },
    areaSlug: "finanzas-contabilidad",
    modality: "RECORDED",
    level: "INITIAL",
    teacherName: "Renzo Salcedo",
    durationHours: 10,
    priceAmount: "299.00",
  }),
  course({
    id: "c3",
    slug: "analisis-de-datos-con-power-bi",
    title: { es: "Análisis de datos con Power BI", en: "Data analysis with Power BI" },
    subtitle: { es: "Convierte datos dispersos en tableros que se entienden de un vistazo", en: "Turn scattered data into clear dashboards" },
    areaSlug: "tecnologia-datos",
    modality: "HYBRID",
    level: "INTERMEDIATE",
    teacherName: "Diego Huamán",
    durationHours: 20,
    nextLiveSessionAt: "2026-09-02T22:00:00.000Z",
    priceAmount: "499.00",
  }),
  course({
    id: "c4",
    slug: "marketing-digital-b2b",
    title: { es: "Marketing digital B2B", en: "B2B digital marketing" },
    subtitle: { es: "Genera demanda calificada en ciclos de venta largos", en: "Generate qualified demand in long sales cycles" },
    areaSlug: "marketing-ventas",
    modality: "RECORDED",
    level: "ADVANCED",
    teacherName: "Camila Vidal",
    durationHours: 14,
    priceAmount: "379.00",
  }),
  course({
    id: "c5",
    slug: "compliance-y-proteccion-de-datos",
    title: { es: "Compliance y protección de datos personales", en: "Compliance & data protection" },
    subtitle: { es: "Aplica la ley de protección de datos sin frenar al negocio", en: "Apply data-protection law without slowing the business" },
    areaSlug: "legal-cumplimiento",
    modality: "LIVE",
    level: "INTERMEDIATE",
    teacherName: "Fernando Ríos",
    durationHours: 8,
    nextLiveSessionAt: "2026-08-28T14:00:00.000Z",
    priceAmount: "329.00",
  }),
  course({
    id: "c6",
    slug: "seguridad-y-salud-en-el-trabajo",
    title: { es: "Seguridad y salud en el trabajo (SST)", en: "Occupational health & safety" },
    subtitle: { es: "Cumple la normativa SST y reduce el riesgo operativo", en: "Meet OHS regulation and reduce operational risk" },
    areaSlug: "salud-seguridad",
    modality: "RECORDED",
    level: "INITIAL",
    teacherName: "Lucía Ponce",
    durationHours: 12,
    priceAmount: "259.00",
  }),
  course({
    id: "c7",
    slug: "gestion-de-proyectos-agiles",
    title: { es: "Gestión de proyectos ágiles", en: "Agile project management" },
    subtitle: { es: "Entrega valor de forma iterativa con Scrum y Kanban", en: "Deliver value iteratively with Scrum and Kanban" },
    areaSlug: "gestion-liderazgo",
    modality: "HYBRID",
    type: "WORKSHOP",
    level: "INTERMEDIATE",
    teacherName: "Marisol Aguirre",
    durationHours: 18,
    nextLiveSessionAt: "2026-09-15T23:00:00.000Z",
    priceAmount: "419.00",
  }),
  course({
    id: "c8",
    slug: "excel-avanzado-para-finanzas",
    title: { es: "Excel avanzado para finanzas", en: "Advanced Excel for finance" },
    subtitle: { es: "Modela escenarios financieros con hojas de cálculo robustas", en: "Model financial scenarios with robust spreadsheets" },
    areaSlug: "finanzas-contabilidad",
    modality: "RECORDED",
    level: "ADVANCED",
    teacherName: "Renzo Salcedo",
    durationHours: 15,
    priceAmount: "349.00",
  }),
];

export const MOCK_SECTIONS = {
  featured: MOCK_COURSES.slice(0, 4),
  upcomingLive: MOCK_COURSES.filter((c) => c.nextLiveSessionAt),
  new: [MOCK_COURSES[2], MOCK_COURSES[4], MOCK_COURSES[6]],
  recommendedPaths: [MOCK_COURSES[1], MOCK_COURSES[7]],
  mostDemanded: [MOCK_COURSES[0], MOCK_COURSES[3], MOCK_COURSES[5], MOCK_COURSES[6]],
};

export const MOCK_COURSE_DETAIL: Record<string, CourseDetailDTO> = MOCK_COURSES.reduce<Record<string, CourseDetailDTO>>(
  (acc, c) => {
    acc[c.slug] = {
      ...c,
      description: {
        es: `Un curso práctico y aplicado, diseñado para profesionales que necesitan resultados desde la primera semana. Combina teoría breve, casos reales de empresas en Perú y LatAm, y ejercicios evaluados.`,
        en: `A practical, applied course designed for professionals who need results from week one. Combines brief theory, real cases from companies in Peru and LatAm, and graded exercises.`,
      },
      accessDurationPolicy: "PERMANENT",
      subtitleLanguages: ["es"],
      prerequisiteCourseIds: [],
      nextRecommendedCourseIds: [],
      modules: [
        {
          id: `${c.id}-m1`,
          order: 1,
          title: { es: "Fundamentos", en: "Foundations" },
          lessons: [
            { id: `${c.id}-m1-l1`, order: 1, title: { es: "Bienvenida y objetivos", en: "Welcome & objectives" }, durationMinutes: 8, isFreePreview: true },
            { id: `${c.id}-m1-l2`, order: 2, title: { es: "Diagnóstico inicial", en: "Initial diagnosis" }, durationMinutes: 22, isFreePreview: false },
          ],
        },
        {
          id: `${c.id}-m2`,
          order: 2,
          title: { es: "Aplicación práctica", en: "Practical application" },
          lessons: [
            { id: `${c.id}-m2-l1`, order: 1, title: { es: "Caso guiado", en: "Guided case" }, durationMinutes: 35, isFreePreview: false },
            { id: `${c.id}-m2-l2`, order: 2, title: { es: "Taller aplicado", en: "Applied workshop" }, durationMinutes: 40, isFreePreview: false },
          ],
        },
        {
          id: `${c.id}-m3`,
          order: 3,
          title: { es: "Evaluación y cierre", en: "Assessment & wrap-up" },
          lessons: [
            { id: `${c.id}-m3-l1`, order: 1, title: { es: "Evaluación final", en: "Final assessment" }, durationMinutes: 30, isFreePreview: false },
          ],
        },
      ],
      liveSessions: c.nextLiveSessionAt
        ? [{ id: `${c.id}-live1`, startsAt: c.nextLiveSessionAt, endsAt: c.nextLiveSessionAt, timezone: "America/Lima" }]
        : [],
    };
    return acc;
  },
  {},
);

export const MOCK_PROGRAM: ProgramDetailDTO = {
  id: "p1",
  slug: "diplomado-en-gestion-financiera",
  title: { es: "Diplomado en Gestión Financiera para Líderes", en: "Diploma in Financial Management for Leaders" },
  description: {
    es: "Una ruta integral de cuatro cursos para dominar la lectura financiera, la gestión de presupuestos y la toma de decisiones de inversión.",
    en: "A comprehensive four-course path to master financial literacy, budgeting and investment decisions.",
  },
  priceAmount: "999.00",
  priceCurrency: "PEN",
  certificationIncluded: true,
  courses: [
    { courseId: "c2", order: 1, isRequired: true, course: MOCK_COURSES[1] },
    { courseId: "c8", order: 2, isRequired: true, course: MOCK_COURSES[7] },
    { courseId: "c1", order: 3, isRequired: false, course: MOCK_COURSES[0] },
  ],
  separatePriceTotal: "1107.00",
  savingsAmount: "108.00",
};

export const MOCK_ENROLLMENTS: EnrollmentSummaryDTO[] = [
  {
    id: "e1",
    offeringKind: "COURSE",
    title: MOCK_COURSES[0].title,
    coverImageUrl: null,
    progressPct: 62,
    status: "ACTIVE",
    source: "B2C_PURCHASE",
    accessExpiresAt: null,
    nextActionLabel: "Continúa en el Módulo 2 · Aplicación práctica",
    certificateAvailable: false,
    approvalMissing: ["Completa el Módulo 3", "Aprueba la evaluación final (mín. 70%)"],
  },
  {
    id: "e2",
    offeringKind: "COURSE",
    title: MOCK_COURSES[2].title,
    coverImageUrl: null,
    progressPct: 100,
    status: "COMPLETED",
    source: "B2B_SEAT",
    accessExpiresAt: null,
    nextActionLabel: null,
    certificateAvailable: true,
    approvalMissing: [],
  },
  {
    id: "e3",
    offeringKind: "PROGRAM",
    title: MOCK_PROGRAM.title,
    coverImageUrl: null,
    progressPct: 20,
    status: "ACTIVE",
    source: "B2C_PURCHASE",
    accessExpiresAt: "2027-01-15T00:00:00.000Z",
    nextActionLabel: "Próxima clase: Excel avanzado para finanzas · 2 sept.",
    certificateAvailable: false,
    approvalMissing: ["Completa Finanzas para no financieros", "Completa Excel avanzado para finanzas"],
  },
];

export const MOCK_CERTIFICATES: CertificateDTO[] = [
  {
    id: "cert1",
    code: "INK-2026-8F3K2",
    issuedAt: "2026-06-10T00:00:00.000Z",
    title: MOCK_COURSES[2].title,
    finalScore: 88,
    pdfUrl: null,
    verificationUrl: "/verificar/INK-2026-8F3K2",
  },
];

export const MOCK_COMPANY_DASHBOARD: CompanyDashboardSummaryDTO = {
  companyId: "comp1",
  legalName: "Corporación Andina S.A.C.",
  activeParticipants: 84,
  seatsAvailable: 36,
  seatsUsed: 84,
  averageProgressPct: 57,
  atRiskParticipants: 9,
  upcomingLiveSessions: [
    { courseTitle: MOCK_COURSES[0].title, startsAt: "2026-09-08T23:00:00.000Z" },
    { courseTitle: MOCK_COURSES[4].title, startsAt: "2026-08-28T14:00:00.000Z" },
  ],
};

export const MOCK_ADMIN_EXCEPTIONS: AdminExceptionDTO[] = [
  { id: "x1", type: "EXAM_PENDING_REVIEW", severity: "HIGH", message: "12 respuestas abiertas esperan calificación hace más de 48h", entityId: "assess-1", createdAt: "2026-08-18T10:00:00.000Z" },
  { id: "x2", type: "PAYMENT_WITHOUT_ENROLLMENT", severity: "HIGH", message: "Orden #4821 pagada sin matrícula generada", entityId: "order-4821", createdAt: "2026-08-19T09:15:00.000Z" },
  { id: "x3", type: "STUDENT_WITHOUT_ACCESS_BEFORE_CLASS", severity: "MEDIUM", message: "3 alumnos sin acceso activo antes de la clase en vivo de mañana", entityId: "live-77", createdAt: "2026-08-19T18:00:00.000Z" },
  { id: "x4", type: "COURSE_WITHOUT_TEACHER", severity: "MEDIUM", message: "El curso 'Compliance y protección de datos' no tiene docente asignado", entityId: "c5", createdAt: "2026-08-17T12:00:00.000Z" },
  { id: "x5", type: "COMPANY_SEATS_EXPIRING", severity: "LOW", message: "Corporación Andina S.A.C. tiene 18 cupos que vencen en 7 días", entityId: "comp1", createdAt: "2026-08-19T08:00:00.000Z" },
];

// Detalle de aula virtual para /me/enrollments/:id. El contrato solo dice
// "detalle + módulos/lecciones + LessonProgress" sin DTO tipado en
// @inkademy/shared (ver docs/API-CONTRACT.md), así que este shape es una
// propuesta razonable; ajustar cuando apps/api publique el DTO real.
export interface ClassroomMaterial {
  id: string;
  title: string;
  kind: string;
  category?: "MAIN" | "SUPPLEMENTARY";
  url: string;
}
export interface ClassroomLesson {
  id: string;
  order: number;
  title: LocalizedText;
  contentType: "VIDEO" | "PDF" | "LINK" | "TEXT" | "ASSIGNMENT";
  durationMinutes?: number;
  // "El administrador debe indicar si ese video inicia el curso" — la
  // lección iniciadora se abre de una vez al entrar al curso.
  isCourseStarter?: boolean;
  videoUrl?: string;
  // Solo aplica a contentType="LINK" — a qué URL apunta la lección.
  externalUrl?: string | null;
  // Subtítulos/transcripción automática (Fase 2, generados con Gemini) —
  // solo viene seteado cuando ya están listos (ver EnrollmentService.getMineDetail).
  subtitlesUrl?: string;
  materials: ClassroomMaterial[];
  completed: boolean;
  lastPositionSeconds: number;
}
export interface ClassroomModule {
  id: string;
  order: number;
  title: LocalizedText;
  // Lecturas/documentos del módulo entero (no de una lección puntual) —
  // ver Material.moduleId/category en apps/api.
  materials: ClassroomMaterial[];
  lessons: ClassroomLesson[];
}
export interface ClassroomDetail {
  enrollmentId: string;
  offeringKind: "COURSE" | "PROGRAM";
  title: LocalizedText;
  courseId: string;
  syllabusUrl?: string | null;
  assessmentId?: string;
  // "El examen solo lo visualizará el alumno una vez completado el curso".
  assessmentUnlocked?: boolean;
  progressPct?: number;
  blockMainVideoDownload?: boolean;
  modules: ClassroomModule[];
  approvalMissing: string[];
  certificateAvailable: boolean;
  // Plazo de acceso (solo aplica a cursos grabados con fecha de término) —
  // accessBlocked ya viene calculado desde la API (el corte real vive ahí,
  // no en esta pantalla): si es true, `modules` llega vacío a propósito.
  accessExpiresAt?: string | null;
  accessBlocked?: boolean;
}

const SAMPLE_VIDEO = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

export function buildMockClassroom(enrollmentId: string, courseSlug: string): ClassroomDetail {
  const detail = MOCK_COURSE_DETAIL[courseSlug] ?? Object.values(MOCK_COURSE_DETAIL)[0];
  const enrollment = MOCK_ENROLLMENTS.find((e) => e.id === enrollmentId);
  return {
    enrollmentId,
    offeringKind: "COURSE",
    title: detail.title,
    courseId: detail.id,
    syllabusUrl: "#",
    assessmentId: `${detail.id}-assess1`,
    assessmentUnlocked: (enrollment?.progressPct ?? 0) >= 100,
    progressPct: enrollment?.progressPct ?? 0,
    approvalMissing: enrollment?.approvalMissing ?? [],
    certificateAvailable: enrollment?.certificateAvailable ?? false,
    modules: detail.modules.map((mod, mIdx) => ({
      id: mod.id,
      order: mod.order,
      title: mod.title,
      materials:
        mIdx === 0
          ? [{ id: `${mod.id}-mat-main`, title: "Lectura principal del módulo (PDF)", kind: "pdf", category: "MAIN" as const, url: "#" }]
          : [],
      lessons: mod.lessons.map((lesson, lIdx) => ({
        id: lesson.id,
        order: lesson.order,
        title: lesson.title,
        contentType: lIdx === mod.lessons.length - 1 && mIdx === detail.modules.length - 1 ? "ASSIGNMENT" : "VIDEO",
        durationMinutes: lesson.durationMinutes ?? undefined,
        videoUrl: SAMPLE_VIDEO,
        materials:
          lIdx === 0
            ? [{ id: `${lesson.id}-mat1`, title: "Guía de la sesión (PDF)", kind: "pdf", category: "MAIN" as const, url: "#" }]
            : [],
        completed: mIdx === 0,
        lastPositionSeconds: 0,
      })),
    })),
  };
}

export const MOCK_SUPPORT_TICKETS: SupportTicketSummaryDTO[] = [
  { id: "t1", subject: "No puedo acceder a la clase en vivo", category: "acceso", priority: "HIGH", status: "IN_PROGRESS", createdAt: "2026-08-18T10:00:00.000Z", lastMessageAt: "2026-08-19T09:00:00.000Z" },
  { id: "t2", subject: "Mi certificado tiene el nombre incompleto", category: "certificados", priority: "MEDIUM", status: "OPEN", createdAt: "2026-08-15T10:00:00.000Z", lastMessageAt: null },
];

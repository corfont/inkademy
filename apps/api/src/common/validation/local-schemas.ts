import { z } from "zod";
import { strongPasswordSchema } from "@inkademy/shared";

// ============================================================================
// Esquemas zod que NO están definidos en @inkademy/shared/validation porque el
// contrato no los especificó allí explícitamente, o porque son detalles de
// implementación internos de apps/api. Se mantienen separados (en vez de
// tocar packages/shared) según las reglas del proyecto.
// ============================================================================

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: strongPasswordSchema,
});

export const updateLessonProgressSchema = z.object({
  completed: z.boolean().optional(),
  lastPositionSeconds: z.number().int().min(0).optional(),
});

// "Las notas del alumno se guardaban solo en localStorage" — ahora viven en
// LessonNote, sincronizadas entre dispositivos.
export const upsertLessonNoteSchema = z.object({
  content: z.string().max(20000),
});

export const submitCourseRatingSchema = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});

export const catalogFiltersSchema = z.object({
  q: z.string().optional(),
  areaSlug: z.string().optional(),
  modality: z.enum(["RECORDED", "LIVE", "HYBRID"]).optional(),
  level: z.enum(["INITIAL", "INTERMEDIATE", "ADVANCED"]).optional(),
  type: z
    .enum(["COURSE", "WORKSHOP", "SEMINAR", "MASTERCLASS", "PROGRAM", "DIPLOMA", "CORPORATE_INHOUSE"])
    .optional(),
  language: z.string().optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  certificationOnly: z.coerce.boolean().optional(),
  sort: z.enum(["newest", "priceAsc", "priceDesc", "bestSelling"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

export const assignSeatSchema = z.object({
  userId: z.string().uuid(),
});

export const gradeAnswerSchema = z.object({
  score: z.number().min(0),
  isCorrect: z.boolean(),
});

export const localizedTextSchema = z.record(z.string(), z.string());

export const upsertAreaSchema = z.object({
  slug: z.string().min(1),
  name: localizedTextSchema,
  icon: z.string().optional(),
  order: z.number().int().optional(),
});

export const upsertCourseSchema = z.object({
  slug: z.string().min(1),
  title: localizedTextSchema,
  subtitle: localizedTextSchema.optional(),
  description: localizedTextSchema.optional(),
  areaId: z.string().uuid(),
  subareaId: z.string().uuid().optional(),
  modality: z.enum(["RECORDED", "LIVE", "HYBRID"]),
  type: z
    .enum(["COURSE", "WORKSHOP", "SEMINAR", "MASTERCLASS", "PROGRAM", "DIPLOMA", "CORPORATE_INHOUSE"])
    .optional(),
  level: z.enum(["INITIAL", "INTERMEDIATE", "ADVANCED"]),
  language: z.string().optional(),
  subtitleLanguages: z.array(z.string()).optional(),
  durationHours: z.number().positive(),
  durationUnit: z.enum(["HOURS", "WEEKS", "MONTHS"]).optional(),
  coverImageAssetId: z.string().optional(),
  syllabusAssetId: z.string().optional().nullable(),
  priceAmount: z.number().nonnegative(),
  priceCurrency: z.string().optional(),
  certificationIncluded: z.boolean().optional(),
  accessDurationPolicy: z.enum(["DAYS_30", "MONTHS_6", "PERMANENT"]).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  b2bAvailable: z.boolean().optional(),
  b2bPriceAmount: z.number().nonnegative().optional(),
  discountPercent: z.number().min(0).max(90).nullable().optional(),
  discountExpiresAt: z.coerce.date().nullable().optional(),
  prerequisiteCourseIds: z.array(z.string()).optional(),
  nextRecommendedCourseIds: z.array(z.string()).optional(),
  certificateTemplateId: z.string().uuid().nullable().optional(),
  blockMainVideoDownload: z.boolean().optional(),
  // "El administrador podría crear secciones en la página" — libres,
  // opcionales, ordenables (p.ej. "A quién va dirigido", "Requisitos
  // mínimos") — ver CourseDetailSection en @inkademy/shared.
  detailSections: z
    .array(z.object({ id: z.string().min(1), title: localizedTextSchema, body: localizedTextSchema }))
    .max(12)
    .optional()
    .nullable(),
  // Plantilla de cabecera/pie/instrucciones que heredan todos los exámenes
  // de este curso salvo que tengan su propio override — ver upsertAssessmentSchema.
  examHeaderText: localizedTextSchema.optional().nullable(),
  examFooterText: localizedTextSchema.optional().nullable(),
  examInstructionsText: localizedTextSchema.optional().nullable(),
});
export const updateCourseSchema = upsertCourseSchema.partial();

// --- Contenido de curso: módulos / lecciones / materiales ---
export const upsertModuleSchema = z.object({
  title: localizedTextSchema,
  order: z.number().int().nonnegative().optional(),
});
export const updateModuleSchema = upsertModuleSchema.partial();

// "Cursos e-learning interactivos con evaluación formativa integrada" —
// preguntas cortas de autoevaluación DENTRO de la lección misma, para que
// el alumno vea de una vez si entendió (feedback inmediato, con
// explicación) — a diferencia de una Assessment normal, esto NUNCA se
// guarda ni cuenta para la nota/certificado (es formativo, no sumativo).
const formativeQuizQuestionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(6),
  correctIndex: z.number().int().min(0),
  explanation: z.string().optional().nullable(),
  // "Interacciones sobre un video: al llegar a un segundo disparo, pausar y
  // mostrar la pregunta bloqueando el avance hasta responder" — si se
  // define, la pregunta deja de ser un autochequeo debajo del video (como
  // hasta ahora) y pasa a interrumpir la reproducción en ese segundo
  // exacto. null/ausente = comportamiento de siempre (no bloqueante).
  videoTimestampSeconds: z.number().int().min(0).optional().nullable(),
});
export const formativeQuizSchema = z.object({ questions: z.array(formativeQuizQuestionSchema).max(20) });

export const upsertLessonSchema = z.object({
  title: localizedTextSchema,
  order: z.number().int().nonnegative().optional(),
  contentType: z.enum(["VIDEO", "PDF", "LINK", "TEXT", "SCORM", "AUDIO"]),
  videoAssetId: z.string().optional(),
  audioAssetId: z.string().optional(),
  // Solo tiene sentido para contentType=LINK — a qué URL apunta la lección.
  externalUrl: z.string().url().optional().nullable(),
  durationMinutes: z.number().int().positive().optional(),
  isFreePreview: z.boolean().optional(),
  isCourseStarter: z.boolean().optional(),
  formativeQuiz: formativeQuizSchema.optional().nullable(),
});
export const updateLessonSchema = upsertLessonSchema.partial();

// --- Editor de autoría SCORM (armar el paquete DESDE Inkademy) ---
const scormContentSlideSchema = z.object({
  id: z.string().min(1),
  type: z.literal("content"),
  title: z.string().min(1).max(200),
  body: z.string().max(5000),
  imageUrl: z.string().url().optional().nullable(),
});
const scormQuestionSlideSchema = z.object({
  id: z.string().min(1),
  type: z.literal("question"),
  question: z.string().min(1).max(1000),
  options: z.array(z.string().min(1).max(300)).min(2).max(6),
  correctIndex: z.number().int().min(0),
  explanation: z.string().max(1000).optional().nullable(),
});
export const scormSlideSchema = z.discriminatedUnion("type", [scormContentSlideSchema, scormQuestionSlideSchema]);
export const scormAuthoredContentSchema = z.object({
  slides: z.array(scormSlideSchema).min(1).max(50),
  passingScore: z.number().min(0).max(100).default(70),
});

export const upsertMaterialSchema = z
  .object({
    title: z.string().min(1),
    // Un material kind="link" no sube archivo — usa externalUrl en vez de
    // assetId. Todo lo demás (pdf/slide/doc/sheet/image/video/template)
    // sigue necesitando el asset ya subido.
    assetId: z.string().min(1).optional(),
    externalUrl: z.string().url().optional(),
    kind: z.string().min(1),
    category: z.enum(["MAIN", "SUPPLEMENTARY"]).optional(),
    visible: z.boolean().optional(),
    // "El docente/admin dueño de su curso podrá marcar si el material puede
    // descargarse, visualizarse, o ambos" — ambos true por defecto (comportamiento anterior).
    allowDownload: z.boolean().optional(),
    allowView: z.boolean().optional(),
  })
  .refine((v) => (v.kind === "link" ? Boolean(v.externalUrl) : Boolean(v.assetId)), {
    message: "Un material de tipo link necesita externalUrl; cualquier otro tipo necesita assetId",
  })
  .refine((v) => v.allowDownload !== false || v.allowView !== false, {
    message: "El material debe permitir al menos descarga o visualización",
  });
export const updateMaterialSchema = z
  .object({
    title: z.string().min(1).optional(),
    category: z.enum(["MAIN", "SUPPLEMENTARY"]).optional(),
    visible: z.boolean().optional(),
    allowDownload: z.boolean().optional(),
    allowView: z.boolean().optional(),
  })
  .refine((v) => v.allowDownload !== false || v.allowView !== false, {
    message: "El material debe permitir al menos descarga o visualización",
  });

export const upsertProgramSchema = z.object({
  slug: z.string().min(1),
  title: localizedTextSchema,
  description: localizedTextSchema.optional(),
  type: z.enum(["PROGRAM", "DIPLOMA"]).optional(),
  coverImageAssetId: z.string().optional(),
  priceAmount: z.number().nonnegative(),
  priceCurrency: z.string().optional(),
  certificationIncluded: z.boolean().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  courseIds: z.array(z.string().uuid()).optional(),
  certificateTemplateId: z.string().uuid().nullable().optional(),
});
export const updateProgramSchema = upsertProgramSchema.partial();

const tagPositionSchema = z.object({
  tag: z.string().min(1),
  xPercent: z.number().min(0).max(100),
  yPercent: z.number().min(0).max(100),
  fontSizePt: z.number().positive().optional(),
  color: z.string().optional(),
  align: z.enum(["left", "center", "right"]).optional(),
  fontFamily: z.enum(["helvetica", "helvetica-bold", "times", "times-bold", "courier"]).optional(),
  widthPercent: z.number().positive().max(100).optional(),
  heightPercent: z.number().positive().max(100).optional(),
  // Tags creados a mano por el admin (texto libre o imagen propia) — ver
  // packages/shared/certificate-tags.ts isCustomTag(). customText es el
  // contenido literal (no un placeholder de datos reales); customImageAssetId
  // es el PNG/JPG subido para un tag de imagen a medida.
  customText: z.string().optional(),
  customImageAssetId: z.string().optional(),
  marginTopPt: z.number().optional(),
  marginBottomPt: z.number().optional(),
  marginLeftPt: z.number().optional(),
  marginRightPt: z.number().optional(),
  lineHeightMultiplier: z.number().positive().optional(),
});

export const upsertCertificateTemplateSchema = z.object({
  name: z.string().min(1),
  locale: z.string().optional(),
  // htmlTemplate es obligatorio si sourceType=HTML; se valida con .refine más abajo.
  htmlTemplate: z.string().optional().default(""),
  active: z.boolean().optional(),
  sourceType: z.enum(["HTML", "BACKGROUND"]).optional(),
  backgroundAssetId: z.string().optional().nullable(),
  backgroundMimeType: z.string().optional().nullable(),
  pageWidthPt: z.number().positive().optional(),
  pageHeightPt: z.number().positive().optional(),
  tagPositions: z.array(tagPositionSchema).optional(),
});
export const updateCertificateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  htmlTemplate: z.string().optional(),
  active: z.boolean().optional(),
  sourceType: z.enum(["HTML", "BACKGROUND"]).optional(),
  backgroundAssetId: z.string().optional().nullable(),
  backgroundMimeType: z.string().optional().nullable(),
  pageWidthPt: z.number().positive().optional(),
  pageHeightPt: z.number().positive().optional(),
  tagPositions: z.array(tagPositionSchema).optional(),
});

export const updateApprovalRuleSchema = z.object({
  minProgressPct: z.number().min(0).max(100).optional(),
  minAttendancePct: z.number().min(0).max(100).optional().nullable(),
  // "El administrador puede poner un plazo de conexión mínima, por ejemplo
  // 20 min; si el alumno ha estado 20 min o más se le considera presente"
  // — umbral por sesión (no confundir con minAttendancePct, que es el % de
  // SESIONES a las que asistió sobre el total del curso).
  minConnectionMinutes: z.number().int().min(0).optional().nullable(),
  minScore: z.number().min(0).max(100).optional(),
  requiresAssignment: z.boolean().optional(),
  scoreMode: z.enum(["BEST_ATTEMPT", "WEIGHTED_AVERAGE"]).optional(),
});

export const upsertPartnerInstitutionSchema = z.object({
  name: z.string().min(1),
  contactEmail: z.string().email().optional().nullable(),
  signerName: z.string().optional().nullable(),
  signerTitle: z.string().optional().nullable(),
  signatureAssetId: z.string().optional().nullable(),
  billingType: z.enum(["FIXED", "PER_COURSE", "PER_PERIOD", "PER_ENROLLMENT"]).optional(),
  feeAmount: z.number().min(0).optional().nullable(),
  feeCurrency: z.enum(["PEN", "USD"]).optional(),
  invoicesDirectly: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const addCoursePartnershipSchema = z.object({
  courseId: z.string().uuid(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// "Los convenios se pueden renovar, extender su plazo" — null limpia esa fecha (convenio indefinido).
export const updateCoursePartnershipSchema = z.object({
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
});

// --- Liquidación de docentes ---
export const upsertTeacherRateSchema = z.object({
  teacherId: z.string().uuid(),
  courseId: z.string().uuid().optional().nullable(),
  hourlyRateTeaching: z.number().min(0).optional(),
  hourlyRateOtherActivities: z.number().min(0).optional(),
  currency: z.enum(["PEN", "USD"]).optional(),
  toleranceMinutes: z.number().int().min(0).max(120).optional(),
  paymentFrequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "END_OF_COURSE"]).optional(),
  active: z.boolean().optional(),
});

export const createTeacherActivityLogSchema = z.object({
  teacherId: z.string().uuid(),
  courseId: z.string().uuid().optional(),
  activityType: z.enum(["GRADING", "OTHER"]).optional(),
  hours: z.number().positive(),
  note: z.string().optional(),
  loggedAt: z.string().optional(),
});

export const createTeacherAdvanceSchema = z.object({
  teacherId: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.enum(["PEN", "USD"]).optional(),
  note: z.string().optional(),
});

export const generateTeacherLiquidationSchema = z.object({
  teacherId: z.string().uuid(),
  periodStart: z.string(),
  periodEnd: z.string(),
});

// "Poder eliminar si uno ya no lo quiere visualizar, uno a uno o en
// bloque" — borra filas del historial de cortesías (AuditLog), no revoca accesos.
export const deleteCourtesyGrantsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});

export const waiveLiquidationSchema = z.object({
  reason: z.string().min(3),
});

export const upsertRoyaltyRecipientSchema = z.object({
  // "Puede ser un docente, un personal externo, inclusive un alumno" — si
  // se vincula a una cuenta real (userId), name/contactEmail se rellenan
  // desde ese User; si no, sigue siendo un contacto externo en texto libre.
  userId: z.string().uuid().optional().nullable(),
  name: z.string().min(1),
  contactEmail: z.string().email().optional().nullable(),
  billingType: z.enum(["PER_ENROLLMENT", "PER_COMPLETION", "PER_REFERRAL"]).optional(),
  feePercent: z.number().min(0).max(100).optional(),
  feeCurrency: z.enum(["PEN", "USD"]).optional(),
  active: z.boolean().optional(),
});

export const addCourseRoyaltySchema = z.object({
  courseId: z.string().uuid(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const createCalendarEventSchema = z.object({
  type: z.enum([
    "LIVE_CLASS",
    "COURSE_START",
    "COURSE_DEADLINE",
    "ASSIGNMENT_DUE",
    "EXAM",
    "MENTORSHIP",
    "ACCESS_EXPIRATION",
  ]),
  title: z.string().min(1),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional(),
  liveSessionId: z.string().uuid().optional(),
});
export const updateCalendarEventSchema = createCalendarEventSchema.partial();

export const createLiveSessionSchema = z.object({
  courseId: z.string().uuid(),
  title: localizedTextSchema.optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  timezone: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  organizerUpn: z.string().email().optional(),
  teacherId: z.string().uuid().optional(),
});

// "Repetir cada semana hasta que se cumpla la duración del curso" — genera
// N sesiones semanales (misma hora, mismo día de la semana) a partir de la
// primera, deteniéndose al alcanzar la duración total del curso.
export const createLiveSessionSeriesSchema = z.object({
  courseId: z.string().uuid(),
  title: localizedTextSchema.optional(),
  firstStartsAt: z.coerce.date(),
  sessionDurationMinutes: z.number().int().positive(),
  timezone: z.string().optional(),
  capacity: z.number().int().positive().optional(),
  organizerUpn: z.string().email().optional(),
  teacherId: z.string().uuid().optional(),
});

export const cancelLiveSessionSchema = z.object({
  reason: z.string().min(3),
});

/**
 * Otorga acceso gratuito a un curso/programa que SÍ tiene precio —
 * decisión discrecional del admin (estrategia de marketing, cortesía,
 * etc.), no un curso gratuito. Por eso NUNCA genera Order/Payment/
 * ElectronicInvoice — ver CommerceService.grantFree.
 */
export const grantFreeAccessSchema = z
  .object({
    offeringKind: z.enum(["COURSE", "PROGRAM"]),
    // Slug/email en vez de uuid crudo: el admin los copia directo del
    // catálogo o de la ficha del usuario, sin tener que ir a buscar el id.
    courseSlug: z.string().min(1).optional(),
    programSlug: z.string().min(1).optional(),
    userEmail: z.string().email().optional(),
    companyId: z.string().uuid().optional(),
    seatPoolQty: z.number().int().positive().optional(),
    note: z.string().min(3),
  })
  .refine((v) => Boolean(v.userEmail) !== Boolean(v.companyId), {
    message: "Indica userEmail (persona) o companyId (empresa), no ambos ni ninguno",
  })
  .refine((v) => Boolean(v.courseSlug) !== Boolean(v.programSlug), {
    message: "Indica courseSlug o programSlug, no ambos ni ninguno",
  });

// --- Autoría de evaluaciones (exámenes/quizzes/preguntas) ---
export const upsertAssessmentSchema = z.object({
  title: localizedTextSchema,
  type: z.string().min(1).default("quiz"), // quiz | exam | assignment
  // "La nota mínima no debería repetirse... hereda la regla del curso" —
  // SIN default acá a propósito: si el creador no manda minScore, debe
  // llegar `undefined` de verdad hasta AssessmentService.createAssessment
  // para que pueda heredar ApprovalRule.minScore. Con `.default(70)` acá,
  // Zod completaba el valor ANTES de llegar al service — este nunca veía
  // un `undefined` real y el 70 fijo del schema ganaba siempre.
  minScore: z.number().min(0).max(100).optional(),
  maxAttempts: z.number().int().positive().default(3),
  // "Si no pongo límite de tiempo me aparece un error" — el builder manda
  // `null` explícito para poder QUITAR un límite ya puesto (con solo
  // `.optional()`, un PATCH nunca podría limpiarlo: JSON.stringify borra
  // las claves `undefined`, así que el valor viejo se quedaría para
  // siempre). `.nullable()` es lo que le faltaba.
  timeLimitMinutes: z.number().int().positive().nullable().optional(),
  displayMode: z.enum(["ALL_AT_ONCE", "ONE_BY_ONE"]).default("ALL_AT_ONCE"),
  questionOrder: z.enum(["FIXED", "RANDOM"]).default("FIXED"),
  randomizeOptions: z.boolean().default(false),
  questionsPerAttempt: z.number().int().positive().optional(),
  availableFrom: z.coerce.date().optional(),
  availableUntil: z.coerce.date().optional(),
  // Examen "cualitativo": el docente sube un archivo (Word/Excel/PPT/
  // imagen/PDF) en vez de preguntas tipeadas — el alumno lo descarga,
  // completa offline, y sube su respuesta como otro archivo para revisión
  // manual. Ambos vacíos = evaluación normal por preguntas (comportamiento
  // de siempre).
  sourceFileAssetId: z.string().optional().nullable(),
  sourceFileMimeType: z.string().optional().nullable(),
  // Peso (%) de este examen en la nota final del curso — solo se usa si
  // ApprovalRule.scoreMode="WEIGHTED_AVERAGE" (diplomados con varios
  // exámenes ponderados). Ver computeCourseScore.
  weightPercent: z.number().min(0).max(100).optional().nullable(),
  // "Se debe poder archivar" — oculta el examen a los alumnos sin borrarlo.
  archived: z.boolean().optional(),
  // "¿Cómo sabe cuál examen tomar en cada módulo?" — null = examen final
  // del curso (exige el curso completo); con valor, se desbloquea apenas
  // ESE módulo se completa. Ver EnrollmentService.isModuleComplete.
  moduleId: z.string().optional().nullable(),
  // Tipografía curada del título (ver BRAND_FONT_OPTIONS en el frontend) —
  // no se restringe a un enum acá porque la lista curada vive en el
  // frontend; el Select ya limita las opciones que llegan a mandarse.
  titleFontFamily: z.string().max(60).optional().nullable(),
  // Cabecera/pie/instrucciones propias de este examen — null hereda la
  // plantilla del curso (Course.examHeaderText/examFooterText/examInstructionsText).
  headerTextOverride: localizedTextSchema.optional().nullable(),
  footerTextOverride: localizedTextSchema.optional().nullable(),
  instructionsOverride: localizedTextSchema.optional().nullable(),
});
export const updateAssessmentSchema = upsertAssessmentSchema.partial();

export const reorderQuestionsSchema = z.object({
  orderedQuestionIds: z.array(z.string().min(1)).min(1),
});

// "Es muy complicado... no drag and drop" — reordenar los exámenes de un
// curso (arrastre en AssessmentsSection), mismo patrón que reorderQuestionsSchema.
export const reorderAssessmentsSchema = z.object({
  orderedAssessmentIds: z.array(z.string().min(1)).min(1),
});

// Reordenar los módulos de un curso (arrastre en ContentSection) — antes no
// existía NINGUNA forma de reordenar módulos, ni con flechas.
export const reorderModulesSchema = z.object({
  orderedModuleIds: z.array(z.string().min(1)).min(1),
});

export const submitFileAttemptSchema = z.object({
  submissionAssetId: z.string().min(1),
  submissionMimeType: z.string().min(1),
});

export const gradeFileAttemptSchema = z.object({
  score: z.number().min(0).max(100),
  passed: z.boolean(),
});

export const upsertQuestionSchema = z.object({
  // "ORDERING" faltaba acá pese a estar soportado en el enum de Prisma, la
  // UI y la corrección (assessment.service.ts) — crear una pregunta de
  // ordenar fallaba la validación del backend. Bug real, corregido de paso.
  type: z.enum(["SINGLE_CHOICE", "MULTI_CHOICE", "TRUE_FALSE", "SHORT_ANSWER", "OPEN", "ORDERING"]),
  text: localizedTextSchema,
  // [{ id, text }] para SINGLE_CHOICE/MULTI_CHOICE/TRUE_FALSE; vacío para SHORT_ANSWER/OPEN.
  options: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
  // string (SINGLE_CHOICE/TRUE_FALSE/SHORT_ANSWER) | string[] (MULTI_CHOICE) — null para OPEN.
  correctAnswer: z.union([z.string(), z.array(z.string())]).optional(),
  points: z.number().positive().default(1),
  tags: z.array(z.string()).optional(),
});
export const updateQuestionSchema = upsertQuestionSchema.partial();

// --- Usuarios y roles (admin) ---
export const createUserSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  globalRole: z.enum(["STUDENT", "TEACHER", "SUPPORT", "ADMIN"]),
  // Si el admin no pone una, se genera una temporal (comportamiento anterior).
  password: strongPasswordSchema.optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: strongPasswordSchema,
});

export const adminResetPasswordSchema = z.object({
  // Si no viene, se genera una temporal (igual que al crear la cuenta) y se
  // devuelve una sola vez en la respuesta para que el admin se la pase al usuario.
  password: strongPasswordSchema.optional(),
});

export const updateUserSchema = z.object({
  globalRole: z.enum(["STUDENT", "TEACHER", "SUPPORT", "ADMIN"]).optional(),
  // Roles adicionales — un docente puede además ser alumno/soporte/admin al
  // mismo tiempo. globalRole sigue siendo el "rol principal" (decide a qué
  // panel entra por defecto al iniciar sesión); secondaryRoles solo amplía
  // qué otras áreas puede además visitar.
  secondaryRoles: z.array(z.enum(["STUDENT", "TEACHER", "SUPPORT", "ADMIN"])).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  // Firma manuscrita/imagen del docente, usada en certificados con tag {{teacherSignature}}.
  signatureAssetId: z.string().optional().nullable(),
  // "El admin debería poder editar a cualquier usuario" — antes solo se
  // podía cambiar rol/estado/firma desde /admin/usuarios, sin forma de
  // corregir un nombre mal escrito, un correo, o completar datos de
  // perfil a nombre del usuario (p.ej. por soporte telefónico).
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional().nullable(),
  documentType: z.string().optional().nullable(),
  documentNumber: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  jobTitle: z.string().optional().nullable(),
  companyFreeText: z.string().optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
});

export const assignCourseStaffSchema = z.object({
  email: z.string().email(),
  role: z.enum(["TEACHER", "CO_TEACHER", "MODERATOR"]),
});

// --- Facturación electrónica SUNAT (credenciales/series) ---
export const upsertSunatSettingsSchema = z.object({
  env: z.enum(["beta", "production"]).optional(),
  ruc: z.string().length(11).optional().nullable(),
  solUser: z.string().optional().nullable(),
  solPassword: z.string().optional(), // vacío = "no cambiar" (ver SunatSettingsService.update)
  razonSocial: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  ubigeo: z.string().optional().nullable(),
  boletaSeries: z.string().optional().nullable(),
  facturaSeries: z.string().optional().nullable(),
  boletaCreditSeries: z.string().optional().nullable(),
  facturaCreditSeries: z.string().optional().nullable(),
  certPem: z.string().optional(),
  certKeyPem: z.string().optional(),
  taxAffectation: z.enum(["EXONERADO", "GRAVADO"]).optional(),
  igvPercent: z.number().min(0).max(100).optional(),
});

export const upsertChatbotSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  apiKey: z.string().optional(), // vacío = "no cambiar" (ver ChatbotSettingsService.update)
  systemPrompt: z.string().optional().nullable(),
  suggestionAutoRespond: z.boolean().optional(),
  suggestionAutoRespondDelayMinutes: z.number().int().min(1).max(1440).optional(),
});

export const upsertEmailServerSettingsSchema = z.object({
  host: z.string().optional().nullable(),
  port: z.number().int().min(1).max(65535).optional().nullable(),
  secure: z.boolean().optional(),
  username: z.string().optional().nullable(),
  password: z.string().optional(), // vacío = "no cambiar" (ver EmailServerSettingsService.update)
  fromEmail: z.string().email().optional().nullable(),
  fromName: z.string().optional().nullable(),
});

// "Un módulo donde enviar correos a nuestros clientes... programado
// automático con IA, o que uno redacte y parametrice para mandar correos
// masivos" — el filtro de audiencia empezó deliberadamente simple; esta
// segunda vuelta (Fase 2, "segmentación y campañas de marketing avanzadas")
// suma dimensiones reales de negocio sin convertirlo en un motor completo:
// por curso puntual (no solo área), por estado de matrícula (mismo
// concepto que el semáforo de /admin/usuarios), por país, por rol, y
// excluyendo a quien compró hace poco (para no spamear a un comprador
// reciente con una campaña de descuento).
export const emailAudienceFilterSchema = z
  .object({
    interests: z.array(z.string()).optional(),
    areaIds: z.array(z.string()).optional(),
    courseIds: z.array(z.string()).optional(),
    companyId: z.string().optional(),
    inactiveDays: z.number().int().min(1).optional(),
    // ANY (default) = sin filtrar por esto. HAS_ACTIVE = lleva un curso o
    // más ahora mismo. COMPLETED_NO_ACTIVE = ya terminó todo lo que tenía y
    // no lleva nada más (candidato a upsell). NONE = nunca se matriculó
    // (candidato a primera compra).
    enrollmentStatus: z.enum(["ANY", "HAS_ACTIVE", "COMPLETED_NO_ACTIVE", "NONE"]).optional(),
    countries: z.array(z.string()).optional(),
    globalRole: z.enum(["STUDENT", "TEACHER", "SUPPORT", "ADMIN"]).optional(),
    excludeRecentPurchaseDays: z.number().int().min(1).optional(),
  })
  .nullable()
  .optional();

export const upsertEmailCampaignSchema = z
  .object({
    name: z.string().min(1),
    mode: z.enum(["AUTOMATIC_AI", "MANUAL"]),
    goal: z.enum(["RELATED_COURSES", "NEW_COURSES", "DISCOUNTED_COURSES", "BY_INTEREST"]).optional().nullable(),
    subject: z.string().optional().nullable(),
    bodyHtml: z.string().optional().nullable(),
    audienceFilter: emailAudienceFilterSchema,
    scheduledAt: z.string().datetime().optional().nullable(),
    recurrence: z.enum(["ONCE", "WEEKLY", "MONTHLY"]).default("ONCE"),
  })
  .refine((v) => v.mode !== "MANUAL" || (v.subject && v.bodyHtml), {
    message: "Una campaña manual necesita asunto y contenido.",
    path: ["bodyHtml"],
  })
  .refine((v) => v.mode !== "AUTOMATIC_AI" || Boolean(v.goal), {
    message: "Una campaña automática con IA necesita un objetivo.",
    path: ["goal"],
  });

export const updateEmailCampaignSchema = z.object({
  name: z.string().min(1).optional(),
  subject: z.string().optional().nullable(),
  bodyHtml: z.string().optional().nullable(),
  audienceFilter: emailAudienceFilterSchema,
  scheduledAt: z.string().datetime().optional().nullable(),
  recurrence: z.enum(["ONCE", "WEEKLY", "MONTHLY"]).optional(),
  status: z.enum(["DRAFT", "SCHEDULED", "CANCELLED"]).optional(),
});

export const chatbotMessageSchema = z.object({
  message: z.string().min(1).max(2000),
  // Historial reciente de la conversación (para dar contexto sin guardar
  // nada en el servidor) — se recorta a los últimos turnos en el servicio.
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .max(20)
    .optional(),
});

export const rescheduleLiveSessionSchema = z.object({
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  // Por qué se reprograma — se incluye tal cual en el correo a los
  // inscritos, así que se pide explícito (no un default genérico).
  reason: z.string().min(3),
});

export const addSupportMessageSchema = z.object({
  body: z.string().min(1),
});

export const createSeatPoolSchema = z.object({
  offeringKind: z.enum(["COURSE", "PROGRAM"]),
  courseId: z.string().uuid().optional(),
  programId: z.string().uuid().optional(),
  seatsPurchased: z.number().int().positive(),
  expiresAt: z.coerce.date().optional(),
});

export const renewSeatPoolSchema = z.object({
  months: z.number().int().positive().max(60),
});

export const updateCertificateSettingsSchema = z.object({
  certificateDeliveryTarget: z.enum(["STUDENT", "COMPANY_ADMIN", "BOTH"]),
});

// --- Sugerencias de curso ("me gustaría un curso de...") ---
export const createSuggestionSchema = z.object({
  message: z.string().min(5).max(1000),
});
export const updateSuggestionSchema = z.object({
  status: z.enum(["NEW", "REVIEWED", "PLANNED", "DECLINED"]),
});
export const respondSuggestionSchema = z.object({
  response: z.string().min(1).max(2000),
});

// --- Ampliar plazo de acceso de una matrícula (caso especial del admin) ---
export const extendEnrollmentAccessSchema = z.object({
  // null = deja el curso abierto (sin vencimiento) para esta matrícula puntual.
  accessExpiresAt: z.coerce.date().nullable(),
});

// "El administrador debería tener la facultad de resetear un avance a 0%
// o ponerlo como 100%... en casos extremos" — caso especial del admin,
// mismo criterio que extendEnrollmentAccessSchema arriba.
export const resetEnrollmentProgressSchema = z.object({
  target: z.enum(["ZERO", "FULL"]),
});

// "Quisiera tener algunos accesos... para borrar los cursos dados (uno,
// algunos, todos), borrar usuarios" — zona de pruebas del admin, borrado en
// lote de entidades sin actividad real (ver AdminService.bulkDelete*).
export const bulkIdsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

// --- Finanzas: gastos manuales y % de comisión de pasarela ---
export const createExpenseSchema = z.object({
  description: z.string().min(1).max(200),
  amount: z.number().positive(),
  currency: z.enum(["PEN", "USD"]).optional(),
  category: z.enum(["HOSTING", "MARKETING", "PAYROLL", "OTHER"]).optional(),
  incurredAt: z.coerce.date().optional(),
  recurrence: z.enum(["ONCE", "MONTHLY", "ANNUAL"]).optional(),
});
export const updateFeeSettingsSchema = z.object({
  culqiFeePercent: z.number().min(0).max(100).optional(),
  stripeFeePercent: z.number().min(0).max(100).optional(),
  yapePlinFeePercent: z.number().min(0).max(100).optional(),
  detractionEnabled: z.boolean().optional(),
  detractionRucNaturalPercent: z.number().min(0).max(100).optional(),
  detractionRucNaturalThreshold: z.number().min(0).optional(),
  detractionRucEmpresaPercent: z.number().min(0).max(100).optional(),
  usdExchangeRate: z.number().min(0).optional(),
  exchangeRateSourceUrl: z.string().url().optional().nullable(),
});

// --- Apariencia de la plataforma (logo, tipografía, fondo) ---
export const upsertSettingsSchema = z.object({
  logoUrl: z.string().optional().nullable(),
  logoHeightPx: z.number().int().min(12).max(200).optional(),
  headingFontFamily: z.string().min(1).optional(),
  bodyFontFamily: z.string().min(1).optional(),
  backgroundColor: z.string().optional().nullable(),
  backgroundImageUrl: z.string().optional().nullable(),
  primaryColor: z.string().optional().nullable(),
  accentColor: z.string().optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  contactAddress: z.string().optional().nullable(),
  courseCardFields: z
    .object({
      showTeacher: z.boolean().optional(),
      showDuration: z.boolean().optional(),
      showNextLiveSession: z.boolean().optional(),
      showCertificationBadge: z.boolean().optional(),
      showRating: z.boolean().optional(),
    })
    .optional(),
  institutionSignatureAssetId: z.string().optional().nullable(),
  institutionSignatureName: z.string().optional().nullable(),
  institutionSignatureTitle: z.string().optional().nullable(),
  watermarkAssetId: z.string().optional().nullable(),
  watermarkOpacityPct: z.number().int().min(0).max(100).optional(),
  watermarkSizePercent: z.number().int().min(5).max(100).optional(),
  sidebarColor: z.string().optional().nullable(),
  menuFontFamily: z.string().optional().nullable(),
  menuFontSizePx: z.number().int().min(10).max(24).optional().nullable(),
  menuFontColor: z.string().optional().nullable(),
  // "El texto que acompaña el link del certificado por correo debe ser
  // editable (tipo de letra, justificado, color)".
  certificateEmailText: localizedTextSchema.optional().nullable(),
  certificateEmailFontFamily: z.string().optional().nullable(),
  certificateEmailTextAlign: z.enum(["left", "center", "right", "justify"]).optional(),
  certificateEmailTextColor: z.string().optional().nullable(),
});

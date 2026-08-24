import { z } from "zod";

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
  password: z.string().min(8),
});

export const updateLessonProgressSchema = z.object({
  completed: z.boolean().optional(),
  lastPositionSeconds: z.number().int().min(0).optional(),
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
  coverImageAssetId: z.string().optional(),
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
});
export const updateCourseSchema = upsertCourseSchema.partial();

// --- Contenido de curso: módulos / lecciones / materiales ---
export const upsertModuleSchema = z.object({
  title: localizedTextSchema,
  order: z.number().int().nonnegative().optional(),
});
export const updateModuleSchema = upsertModuleSchema.partial();

export const upsertLessonSchema = z.object({
  title: localizedTextSchema,
  order: z.number().int().nonnegative().optional(),
  contentType: z.enum(["VIDEO", "PDF", "LINK", "TEXT"]),
  videoAssetId: z.string().optional(),
  durationMinutes: z.number().int().positive().optional(),
  isFreePreview: z.boolean().optional(),
});
export const updateLessonSchema = upsertLessonSchema.partial();

export const upsertMaterialSchema = z.object({
  title: z.string().min(1),
  assetId: z.string().min(1),
  kind: z.string().min(1),
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

export const upsertCertificateTemplateSchema = z.object({
  name: z.string().min(1),
  locale: z.string().optional(),
  htmlTemplate: z.string().min(1),
  active: z.boolean().optional(),
});
export const updateCertificateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  htmlTemplate: z.string().min(1).optional(),
  active: z.boolean().optional(),
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
  minScore: z.number().min(0).max(100).default(70),
  maxAttempts: z.number().int().positive().default(3),
  timeLimitMinutes: z.number().int().positive().optional(),
  questionOrder: z.enum(["FIXED", "RANDOM"]).default("FIXED"),
  randomizeOptions: z.boolean().default(false),
  questionsPerAttempt: z.number().int().positive().optional(),
  availableFrom: z.coerce.date().optional(),
  availableUntil: z.coerce.date().optional(),
});
export const updateAssessmentSchema = upsertAssessmentSchema.partial();

export const upsertQuestionSchema = z.object({
  type: z.enum(["SINGLE_CHOICE", "MULTI_CHOICE", "TRUE_FALSE", "SHORT_ANSWER", "OPEN"]),
  text: localizedTextSchema,
  // [{ id, text }] para SINGLE_CHOICE/MULTI_CHOICE/TRUE_FALSE; vacío para SHORT_ANSWER/OPEN.
  options: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
  // string (SINGLE_CHOICE/TRUE_FALSE/SHORT_ANSWER) | string[] (MULTI_CHOICE) — null para OPEN.
  correctAnswer: z.union([z.string(), z.array(z.string())]).optional(),
  points: z.number().positive().default(1),
  tags: z.array(z.string()).optional(),
});
export const updateQuestionSchema = upsertQuestionSchema.partial();

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

// --- Sugerencias de curso ("me gustaría un curso de...") ---
export const createSuggestionSchema = z.object({
  message: z.string().min(5).max(1000),
});
export const updateSuggestionSchema = z.object({
  status: z.enum(["NEW", "REVIEWED", "PLANNED", "DECLINED"]),
});

// --- Apariencia de la plataforma (logo, tipografía, fondo) ---
export const upsertSettingsSchema = z.object({
  logoUrl: z.string().optional().nullable(),
  logoHeightPx: z.number().int().min(12).max(200).optional(),
  headingFontFamily: z.string().min(1).optional(),
  bodyFontFamily: z.string().min(1).optional(),
  backgroundColor: z.string().optional().nullable(),
  backgroundImageUrl: z.string().optional().nullable(),
  contactEmail: z.string().email().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  contactAddress: z.string().optional().nullable(),
  courseCardFields: z
    .object({
      showTeacher: z.boolean().optional(),
      showDuration: z.boolean().optional(),
      showNextLiveSession: z.boolean().optional(),
      showCertificationBadge: z.boolean().optional(),
    })
    .optional(),
});

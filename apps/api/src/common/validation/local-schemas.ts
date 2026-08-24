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

// --- Apariencia de la plataforma (logo, tipografía, fondo) ---
export const upsertSettingsSchema = z.object({
  logoUrl: z.string().optional().nullable(),
  logoHeightPx: z.number().int().min(12).max(200).optional(),
  headingFontFamily: z.string().min(1).optional(),
  bodyFontFamily: z.string().min(1).optional(),
  backgroundColor: z.string().optional().nullable(),
  backgroundImageUrl: z.string().optional().nullable(),
});

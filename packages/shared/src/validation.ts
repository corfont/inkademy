import { z } from "zod";

// Esquemas zod usados tanto por los DTOs de NestJS (class-validator los envuelve
// en los controllers) como por los formularios del frontend (react-hook-form).

// Mínimo 8 caracteres, al menos una letra, un número y un carácter especial
// de este conjunto — se usa en registro, reset de contraseña (propio y por
// el admin) y al crear una cuenta con contraseña elegida a mano.
export const PASSWORD_SPECIAL_CHARS = "+-*!$%&";
export const strongPasswordSchema = z
  .string()
  .min(8, "Debe tener al menos 8 caracteres")
  .regex(/[A-Za-z]/, "Debe incluir al menos una letra")
  .regex(/\d/, "Debe incluir al menos un número")
  .regex(/[+\-*!$%&]/, `Debe incluir al menos un carácter especial (${PASSWORD_SPECIAL_CHARS})`);

export const registerSchema = z.object({
  email: z.string().email(),
  password: strongPasswordSchema,
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  locale: z.enum(["es", "en"]).default("es"),
  marketingConsentEmail: z.boolean().default(false),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

// Redes sociales del perfil — todas opcionales, cualquier subconjunto.
export const socialLinksSchema = z.object({
  linkedin: z.string().url().optional().or(z.literal("")),
  instagram: z.string().url().optional().or(z.literal("")),
  facebook: z.string().url().optional().or(z.literal("")),
  twitter: z.string().url().optional().or(z.literal("")),
  tiktok: z.string().url().optional().or(z.literal("")),
});
export type SocialLinksInput = z.infer<typeof socialLinksSchema>;

export const completeProfileSchema = z.object({
  // Antes /campus/perfil dejaba editar estos campos pero PATCH /profile no
  // los aceptaba en absoluto — el nombre/idioma/zona horaria nunca se
  // guardaban de verdad, ni al tener éxito ni al fallar la llamada.
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  locale: z.enum(["es", "en"]).optional(),
  timezone: z.string().optional(),
  documentType: z.string().optional(),
  documentNumber: z.string().optional(),
  country: z.string().length(2).optional(),
  city: z.string().optional(),
  // Antes solo existía country/city — sin una dirección exacta ni fecha de
  // nacimiento, ambas pedidas explícitamente para el perfil.
  address: z.string().optional(),
  birthDate: z.coerce.date().optional(),
  phone: z.string().optional(),
  jobTitle: z.string().optional(),
  companyFreeText: z.string().optional(),
  sector: z.string().optional(),
  interests: z.array(z.string()).optional(),
  experienceLevel: z.enum(["ENTRY", "MID", "SENIOR", "EXECUTIVE"]).optional(),
  socialLinks: socialLinksSchema.optional(),
  marketingConsentEmail: z.boolean().optional(),
  marketingConsentWhatsapp: z.boolean().optional(),
});
export type CompleteProfileInput = z.infer<typeof completeProfileSchema>;

export const createCompanySchema = z.object({
  legalName: z.string().min(1),
  taxIdType: z.string().min(1),
  taxId: z.string().min(1),
  country: z.string().length(2),
  billingAddress: z.string().optional(),
  sector: z.string().optional(),
  size: z.enum(["MICRO", "SMALL", "MEDIUM", "LARGE", "ENTERPRISE"]).optional(),
});
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const inviteCollaboratorSchema = z.object({
  email: z.string().email(),
  role: z.enum(["COMPANY_ADMIN", "PARTICIPANT"]).default("PARTICIPANT"),
  team: z.string().optional(),
});
export type InviteCollaboratorInput = z.infer<typeof inviteCollaboratorSchema>;

export const requestQuoteSchema = z.object({
  companyId: z.string().uuid().optional(), // si no existe aún, se crea junto al request
  legalName: z.string().min(1),
  taxId: z.string().min(1).optional(),
  contactEmail: z.string().email(),
  contactPhone: z.string().optional(),
  offeringDescription: z.string().min(10),
});
export type RequestQuoteInput = z.infer<typeof requestQuoteSchema>;

// Pipeline comercial (Fase 2) — el equipo de ventas fija un monto real,
// a qué oferta corresponde, y hasta cuándo es válida la cotización.
export const respondToQuoteSchema = z.object({
  offeringKind: z.enum(["COURSE", "PROGRAM"]).optional(),
  courseId: z.string().uuid().optional(),
  programId: z.string().uuid().optional(),
  seatsQuoted: z.number().int().positive().optional(),
  amount: z.number().nonnegative(),
  currency: z.enum(["PEN", "USD"]),
  validUntil: z.string().datetime().optional(),
  salesOwner: z.string().optional(),
  internalNotes: z.string().optional(),
});
export type RespondToQuoteInput = z.infer<typeof respondToQuoteSchema>;

export const updateQuoteStatusSchema = z.object({
  status: z.enum(["ACCEPTED", "REJECTED"]),
});
export type UpdateQuoteStatusInput = z.infer<typeof updateQuoteStatusSchema>;

// Encuesta NPS B2B (Fase 2) — "la estructura de la pregunta la establece
// el administrador" — una sola pregunta, localizada como el resto del
// contenido (título de curso, etc.).
export const updateNpsQuestionSchema = z.object({
  question: z.object({ es: z.string().min(1), en: z.string().optional() }),
});
export type UpdateNpsQuestionInput = z.infer<typeof updateNpsQuestionSchema>;

// Escala NPS estándar 0-10 (no 1-5 como CourseRating) + comentario opcional.
export const submitNpsResponseSchema = z.object({
  score: z.number().int().min(0).max(10),
  comment: z.string().max(2000).optional(),
});
export type SubmitNpsResponseInput = z.infer<typeof submitNpsResponseSchema>;

export const checkoutItemSchema = z.object({
  offeringKind: z.enum(["COURSE", "PROGRAM"]),
  courseId: z.string().uuid().optional(),
  programId: z.string().uuid().optional(),
  seatPoolQty: z.number().int().positive().optional(),
});

export const checkoutSchema = z.object({
  items: z.array(checkoutItemSchema).min(1),
  currency: z.enum(["PEN", "USD"]),
  paymentProvider: z.enum(["CULQI", "STRIPE", "PAYPAL"]),
  companyId: z.string().uuid().optional(),
  paymentMethodToken: z.string().min(1),
  // Para emitir la boleta/factura electrónica (SUNAT) tras el pago. Si se
  // omite, se emite una boleta genérica a "Cliente varios" con DNI 00000000
  // (uso habitual para ventas menores en Perú). buyerDocumentType usa el
  // catálogo 06 de SUNAT: 1=DNI, 6=RUC, 4=Carné extranjería, 7=Pasaporte,
  // 0=comprador extranjero sin ninguno de los anteriores.
  buyerDocumentType: z.enum(["1", "6", "4", "7", "0"]).optional(),
  buyerDocumentNumber: z.string().optional(),
  buyerLegalName: z.string().optional(),
  buyerCountry: z.string().length(2).optional(),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

// Paso previo del checkout con PayPal — ver CommerceService.createPayPalOrder.
export const createPayPalOrderSchema = z.object({
  items: z.array(checkoutItemSchema).min(1),
  companyId: z.string().uuid().optional(),
});
export type CreatePayPalOrderInput = z.infer<typeof createPayPalOrderSchema>;

export const cancelOrderSchema = z.object({
  // Catálogo 09 SUNAT (motivos de nota de crédito). "01" = Anulación de la
  // operación, el motivo por defecto cuando el comprador simplemente
  // desiste de la compra.
  reasonCode: z.string().min(1).default("01"),
  reasonDescription: z.string().min(3),
});
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

export const submitAttemptSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        response: z.unknown(),
      }),
    )
    .min(1),
});
export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>;

export const createSupportTicketSchema = z.object({
  category: z.string().min(1),
  subject: z.string().min(3),
  body: z.string().min(3),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
});
export type CreateSupportTicketInput = z.infer<typeof createSupportTicketSchema>;

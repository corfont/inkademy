import { z } from "zod";

// Esquemas zod usados tanto por los DTOs de NestJS (class-validator los envuelve
// en los controllers) como por los formularios del frontend (react-hook-form).

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
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
  phone: z.string().optional(),
  jobTitle: z.string().optional(),
  companyFreeText: z.string().optional(),
  sector: z.string().optional(),
  interests: z.array(z.string()).optional(),
  experienceLevel: z.enum(["ENTRY", "MID", "SENIOR", "EXECUTIVE"]).optional(),
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

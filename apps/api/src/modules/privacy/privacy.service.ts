import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@inkademy/db";
import * as argon2 from "argon2";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PRISMA } from "../../common/prisma/prisma.module";
import { NotificationService } from "../notification/notification.service";
import { addBusinessDays } from "../complaints/complaints.service";
import { logAudit } from "../admin/audit-log.util";

/**
 * Plazo de respuesta a una solicitud ARCO, en días hábiles. Es un valor de partida CONSERVADOR: la normativa de protección de datos
 * personales (Ley 29733 y su reglamento) fija plazos por tipo de derecho y fue actualizada — confírmalo con el asesor legal y ajusta aquí.
 */
export const PRIVACY_RESPONSE_BUSINESS_DAYS = 10;

export const REQUEST_TYPES = ["RECTIFICATION", "CANCELLATION", "OPPOSITION"] as const;

export const createPrivacyRequestSchema = z.object({
  type: z.enum(REQUEST_TYPES),
  message: z.string().trim().max(2000).optional(),
  /** Obligatoria para pedir la eliminación si la cuenta tiene contraseña: evita que alguien con una sesión abierta ajena la borre. */
  password: z.string().max(200).optional(),
});
export type CreatePrivacyRequestInput = z.infer<typeof createPrivacyRequestSchema>;

export const resolvePrivacyRequestSchema = z.object({
  outcome: z.enum(["COMPLETED", "REJECTED"]),
  note: z.string().trim().min(5, "Escribe la respuesta para la persona").max(2000),
});
export type ResolvePrivacyRequestInput = z.infer<typeof resolvePrivacyRequestSchema>;

const TYPE_LABEL: Record<string, string> = {
  ACCESS: "Acceso",
  RECTIFICATION: "Rectificación",
  CANCELLATION: "Cancelación (eliminación)",
  OPPOSITION: "Oposición",
};

@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notifications: NotificationService,
  ) {}

  // ---------------------------------------------------------------- Acceso: descargar mis datos

  /**
   * Derecho de ACCESO / portabilidad: todo lo que el sistema guarda de la persona, en JSON. Excluye secretos (hash de contraseña, tokens de
   * OAuth, identificadores de sesión). Cada descarga se registra como una solicitud de Acceso ya atendida — evidencia de que se cumplió.
   */
  async exportMyData(userId: string) {
    const row = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!row) throw new NotFoundException("Cuenta no encontrada");
    // Fuera del archivo: el hash de la contraseña y el identificador de sesión (secretos, no datos de la persona).
    const { passwordHash: _passwordHash, currentSessionId: _currentSessionId, ...user } = row;

    const [oauth, memberships, enrollments, orders, certificates, attempts, attendances, saved, ratings, tickets, suggestions, notes, notifications, progress] =
      await Promise.all([
        this.prisma.oAuthAccount.findMany({ where: { userId }, select: { provider: true, createdAt: true } }),
        this.prisma.companyMembership.findMany({ where: { userId }, select: { role: true, status: true, team: true, joinedAt: true, company: { select: { legalName: true } } } }),
        this.prisma.enrollment.findMany({
          where: { userId },
          select: { id: true, offeringKind: true, status: true, source: true, progressPct: true, enrolledAt: true, accessExpiresAt: true, course: { select: { title: true } }, program: { select: { title: true } } },
        }),
        this.prisma.order.findMany({
          where: { userId },
          select: {
            id: true, createdAt: true, status: true, currency: true, subtotal: true, discount: true, tax: true, total: true,
            buyerDocumentType: true, buyerDocumentNumber: true, buyerLegalName: true, buyerCountry: true,
            items: { select: { offeringKind: true, quantity: true, unitPrice: true } },
          },
        }),
        this.prisma.certificate.findMany({ where: { userId }, select: { code: true, issuedAt: true, finalScore: true, revoked: true, course: { select: { title: true } }, program: { select: { title: true } } } }),
        this.prisma.assessmentAttempt.findMany({ where: { userId }, select: { attemptNumber: true, startedAt: true, submittedAt: true, score: true, status: true } }),
        this.prisma.attendance.findMany({ where: { userId }, select: { joinedAt: true, leftAt: true, durationMin: true, liveSession: { select: { title: true, startsAt: true } } } }),
        this.prisma.savedCourse.findMany({ where: { userId }, select: { createdAt: true, course: { select: { title: true } } } }),
        this.prisma.courseRating.findMany({ where: { userId }, select: { stars: true, comment: true, improvements: true, createdAt: true, course: { select: { title: true } } } }),
        this.prisma.supportTicket.findMany({
          where: { createdById: userId },
          select: { subject: true, category: true, status: true, createdAt: true, messages: { where: { authorId: userId }, select: { body: true, createdAt: true } } },
        }),
        this.prisma.courseSuggestion.findMany({ where: { userId }, select: { message: true, status: true, createdAt: true } }),
        this.prisma.lessonNote.findMany({ where: { userId }, select: { content: true, updatedAt: true } }),
        this.prisma.notification.findMany({ where: { userId }, select: { type: true, channel: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 500 }),
        this.prisma.lessonProgress.count({ where: { userId, completed: true } }),
      ]);

    await this.prisma.dataSubjectRequest.create({
      data: {
        userId,
        type: "ACCESS",
        status: "COMPLETED",
        requesterEmail: user.email,
        requesterName: `${user.firstName} ${user.lastName}`,
        dueAt: new Date(),
        resolvedAt: new Date(),
        resolutionNote: "Copia de datos descargada por la propia persona desde «Privacidad y mis datos».",
      },
    });
    await logAudit(this.prisma, { actorId: userId, action: "PRIVACY_EXPORT", entity: "User", entityId: userId });

    return {
      generadoEl: new Date().toISOString(),
      aviso: "Copia de los datos personales que Inkademy guarda sobre ti (Ley 29733, derecho de acceso). No incluye contraseñas ni claves de sesión.",
      perfil: user,
      cuentasVinculadas: oauth,
      empresas: memberships,
      matriculas: enrollments,
      ordenes: orders,
      certificados: certificates,
      intentosDeEvaluacion: attempts,
      asistenciaAClases: attendances,
      leccionesCompletadas: progress,
      cursosGuardados: saved,
      calificaciones: ratings,
      soporte: tickets,
      sugerencias: suggestions,
      notasDeLeccion: notes,
      notificaciones: notifications,
    };
  }

  // ---------------------------------------------------------------- Solicitudes de la persona

  listMine(userId: string) {
    return this.prisma.dataSubjectRequest.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, type: true, status: true, message: true, dueAt: true, resolvedAt: true, resolutionNote: true, createdAt: true },
    });
  }

  async createRequest(userId: string, input: CreatePrivacyRequestInput) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("Cuenta no encontrada");

    if (input.type === "CANCELLATION") {
      if (user.passwordHash) {
        if (!input.password || !(await argon2.verify(user.passwordHash, input.password))) {
          throw new BadRequestException("Para pedir la eliminación confirma tu contraseña actual.");
        }
      }
    }
    const open = await this.prisma.dataSubjectRequest.findFirst({ where: { userId, type: input.type, status: "PENDING" } });
    if (open) throw new BadRequestException("Ya tienes una solicitud de este tipo en trámite.");

    const now = new Date();
    const created = await this.prisma.dataSubjectRequest.create({
      data: {
        userId,
        type: input.type,
        message: input.message || null,
        requesterEmail: user.email,
        requesterName: `${user.firstName} ${user.lastName}`,
        dueAt: addBusinessDays(now, PRIVACY_RESPONSE_BUSINESS_DAYS),
      },
    });
    await logAudit(this.prisma, { actorId: userId, action: "PRIVACY_REQUEST_CREATE", entity: "DataSubjectRequest", entityId: created.id, after: { type: input.type } });

    // Acuse a la persona y aviso al equipo: un fallo del correo no debe perder la solicitud ya registrada.
    try {
      const settings = await this.prisma.platformSettings.findFirst({ select: { contactEmail: true } });
      await this.notifications.sendPrivacyRequestAck(user.email, user.firstName, TYPE_LABEL[input.type], created.dueAt, user.id);
      await this.notifications.sendPrivacyRequestToTeam(settings?.contactEmail || "hola@inkademy.com", {
        type: TYPE_LABEL[input.type],
        name: `${user.firstName} ${user.lastName}`,
        dueAt: created.dueAt,
      });
    } catch (err) {
      this.logger.warn(`No se pudo enviar el aviso de la solicitud ${created.id}: ${String(err)}`);
    }
    return { id: created.id, dueAt: created.dueAt };
  }

  // ---------------------------------------------------------------- Administración

  listAll() {
    return this.prisma.dataSubjectRequest.findMany({
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
      take: 500,
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, globalRole: true, status: true } } },
    });
  }

  async resolve(id: string, actorId: string, input: ResolvePrivacyRequestInput) {
    const request = await this.prisma.dataSubjectRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException("Solicitud no encontrada");
    if (request.status !== "PENDING") throw new BadRequestException("Esta solicitud ya fue resuelta.");
    if (request.type === "CANCELLATION" && input.outcome === "COMPLETED") {
      throw new BadRequestException("La eliminación se ejecuta con el botón «Eliminar los datos de esta cuenta», no marcándola como atendida.");
    }
    await this.prisma.dataSubjectRequest.update({
      where: { id },
      data: { status: input.outcome, resolvedAt: new Date(), resolvedById: actorId, resolutionNote: input.note },
    });
    await logAudit(this.prisma, { actorId, action: "PRIVACY_REQUEST_RESOLVE", entity: "DataSubjectRequest", entityId: id, after: { outcome: input.outcome } });
    if (request.requesterEmail) {
      await this.notifications.sendPrivacyRequestResolved(request.requesterEmail, request.requesterName ?? "", TYPE_LABEL[request.type] ?? request.type, input.outcome, input.note, request.userId ?? undefined);
    }
    return { id, status: input.outcome };
  }

  /** null = se puede ejecutar; si no, el motivo. */
  private async cancellationBlockReason(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { globalRole: true, secondaryRoles: true } });
    if (!user) return "La cuenta ya no existe.";
    if (user.globalRole === "ADMIN" || user.secondaryRoles.includes("ADMIN")) return "Es administrador: primero quítale el rol de administrador.";
    const [pendingOrders, openLiquidations] = await Promise.all([
      this.prisma.order.count({ where: { userId, status: "PENDING" } }),
      this.prisma.teacherLiquidation.count({ where: { teacherId: userId, status: { in: ["DRAFT", "APPROVED"] } } }),
    ]);
    if (pendingOrders > 0) return "Tiene una compra pendiente de pago: espera a que se resuelva.";
    if (openLiquidations > 0) return "Tiene liquidaciones de docente sin pagar: págalas o anúlalas antes de eliminar sus datos.";
    return null;
  }

  /**
   * Derecho de CANCELACIÓN: elimina o anonimiza los datos personales. Lo que la ley obliga a conservar NO se borra: órdenes, pagos y
   * comprobantes electrónicos (SUNAT) y certificados emitidos (verificables por terceros) quedan, ya sin vínculo con una persona
   * identificable en la cuenta — el comprobante conserva los datos del comprador porque es un documento tributario.
   */
  async executeCancellation(id: string, actorId: string) {
    const request = await this.prisma.dataSubjectRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException("Solicitud no encontrada");
    if (request.type !== "CANCELLATION") throw new BadRequestException("Esta solicitud no es de eliminación.");
    if (request.status !== "PENDING") throw new BadRequestException("Esta solicitud ya fue resuelta.");
    if (!request.userId) throw new BadRequestException("La cuenta ya no existe.");
    const userId = request.userId;
    const reason = await this.cancellationBlockReason(userId);
    if (reason) throw new ForbiddenException(reason);

    const originalEmail = request.requesterEmail;
    const originalName = request.requesterName ?? "";

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          email: `eliminado-${userId}@anonimo.invalid`,
          passwordHash: null,
          firstName: "Cuenta",
          lastName: "eliminada",
          displayName: null,
          avatarUrl: null,
          status: "disabled",
          secondaryRoles: [],
          adminRoleId: null,
          currentSessionId: randomUUID(), // cierra cualquier sesión abierta
          failedLoginAttempts: 0,
          lockedUntil: null,
          documentType: null,
          documentNumber: null,
          country: null,
          city: null,
          address: null,
          birthDate: null,
          phone: null,
          jobTitle: null,
          companyFreeText: null,
          sector: null,
          interests: [],
          experienceLevel: null,
          socialLinks: Prisma.DbNull, // `undefined` NO lo borraría: Prisma lo toma como «no cambiar»
          signatureAssetId: null,
          bankName: null,
          bankAccountNumber: null,
          bankAccountCci: null,
          marketingConsentEmail: false,
          marketingConsentWhatsapp: false,
          educationLevel: null,
          institution: null,
          studyField: null,
          graduationYear: null,
          referralCode: null,
          referredByUserId: null,
        },
      }),
      this.prisma.oAuthAccount.deleteMany({ where: { userId } }),
      this.prisma.savedCourse.deleteMany({ where: { userId } }),
      this.prisma.lessonNote.deleteMany({ where: { userId } }),
      this.prisma.notification.deleteMany({ where: { userId } }),
      this.prisma.calendarEvent.deleteMany({ where: { userId } }),
      this.prisma.recommendation.deleteMany({ where: { userId } }),
      this.prisma.companyMembership.deleteMany({ where: { userId } }),
      // La copia del correo/nombre de ESTA y de las demás solicitudes de la persona se borra: era el dato que pidió eliminar.
      this.prisma.dataSubjectRequest.updateMany({ where: { userId }, data: { requesterEmail: null, requesterName: null } }),
      this.prisma.dataSubjectRequest.update({
        where: { id },
        data: {
          status: "COMPLETED",
          resolvedAt: new Date(),
          resolvedById: actorId,
          resolutionNote: "Datos personales eliminados o anonimizados. Se conservan, por obligación legal, los comprobantes de pago y los certificados emitidos.",
        },
      }),
    ]);
    await logAudit(this.prisma, { actorId, action: "PRIVACY_CANCELLATION_EXECUTE", entity: "User", entityId: userId, after: { requestId: id } });

    if (originalEmail) {
      await this.notifications.sendPrivacyRequestResolved(
        originalEmail,
        originalName,
        TYPE_LABEL.CANCELLATION,
        "COMPLETED",
        "Eliminamos tus datos personales de Inkademy. Por obligación legal conservamos los comprobantes de pago y los certificados que ya se emitieron.",
      );
    }
    return { id, status: "COMPLETED" };
  }
}

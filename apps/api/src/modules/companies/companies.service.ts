import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@inkademy/db";
import type {
  CompanyDashboardSummaryDTO,
  CreateCompanyInput,
  InviteCollaboratorInput,
  RequestQuoteInput,
  RespondToQuoteInput,
} from "@inkademy/shared";
import { PRISMA } from "../../common/prisma/prisma.module";
import { decimalToString } from "../../common/utils/money";
import { CalendarService } from "../calendar/calendar.service";
import { NotificationService } from "../notification/notification.service";
import { EnrollmentService } from "../enrollment/enrollment.service";

@Injectable()
export class CompaniesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly calendarService: CalendarService,
    private readonly notifications: NotificationService,
    private readonly enrollmentService: EnrollmentService,
  ) {}

  async create(userId: string, input: CreateCompanyInput) {
    const existing = await this.prisma.company.findUnique({
      where: { country_taxIdType_taxId: { country: input.country, taxIdType: input.taxIdType, taxId: input.taxId } },
    });
    if (existing) throw new BadRequestException("Ya existe una empresa registrada con ese documento tributario");

    const company = await this.prisma.company.create({
      data: {
        legalName: input.legalName,
        taxIdType: input.taxIdType,
        taxId: input.taxId,
        country: input.country,
        billingAddress: input.billingAddress,
        sector: input.sector,
        size: input.size,
        memberships: {
          create: { userId, role: "COMPANY_ADMIN", status: "ACTIVE", joinedAt: new Date() },
        },
      },
    });

    // "Debe existir el rol Empresa" — quien crea una empresa sin tener ya
    // un rol más específico (TEACHER/ADMIN/SUPPORT) pasa a entrar
    // directamente a /empresa al iniciar sesión, en vez de caer siempre en
    // el panel de alumno aunque nunca le haya interesado tomar cursos. Si
    // ya tenía otro rol, se le agrega COMPANY como rol secundario (mismo
    // patrón multi-rol que TEACHER/STUDENT en el sidebar) para no perder
    // acceso a lo que ya tenía.
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user && user.globalRole === "STUDENT") {
      await this.prisma.user.update({
        where: { id: userId },
        data: { globalRole: "COMPANY", secondaryRoles: { push: "STUDENT" } },
      });
    } else if (user && !user.secondaryRoles.includes("COMPANY") && user.globalRole !== "COMPANY") {
      await this.prisma.user.update({ where: { id: userId }, data: { secondaryRoles: { push: "COMPANY" } } });
    }

    return company;
  }

  /** Empresas a las que pertenece el usuario — usadas para resolver a dónde entrar tras iniciar sesión (ver /empresa). */
  async listMine(userId: string) {
    const memberships = await this.prisma.companyMembership.findMany({
      where: { userId, status: "ACTIVE" },
      include: { company: true },
      orderBy: { joinedAt: "asc" },
    });
    return memberships.map((m) => ({ companyId: m.companyId, legalName: m.company.legalName, role: m.role }));
  }

  /**
   * "El administrador puede escoger si quiere que los certificados le
   * lleguen al administrador, al usuario o a ambos" — configuración propia
   * de cada empresa, la decide su COMPANY_ADMIN (ver certificateDeliveryTarget
   * en CertificateService.checkAndIssueIfEligible, que es donde se aplica
   * de verdad al emitir).
   */
  async getCertificateSettings(companyId: string) {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    return { certificateDeliveryTarget: company.certificateDeliveryTarget };
  }

  async updateCertificateSettings(companyId: string, certificateDeliveryTarget: "STUDENT" | "COMPANY_ADMIN" | "BOTH") {
    await this.prisma.company.update({ where: { id: companyId }, data: { certificateDeliveryTarget } });
    return { certificateDeliveryTarget };
  }

  async getDashboard(companyId: string): Promise<CompanyDashboardSummaryDTO> {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });

    const [activeParticipants, seatPools, enrollments, upcomingSessions] = await Promise.all([
      this.prisma.companyMembership.count({ where: { companyId, status: "ACTIVE" } }),
      this.prisma.companySeatPool.findMany({ where: { companyId } }),
      this.prisma.enrollment.findMany({ where: { companyId }, include: { course: true } }),
      this.prisma.liveSession.findMany({
        where: { course: { enrollments: { some: { companyId } } }, startsAt: { gt: new Date() } },
        orderBy: { startsAt: "asc" },
        take: 5,
        include: { course: true },
      }),
    ]);

    const seatsAvailable = seatPools.reduce((sum, p) => sum + (p.seatsPurchased - p.seatsUsed), 0);
    const seatsUsed = seatPools.reduce((sum, p) => sum + p.seatsUsed, 0);
    const averageProgressPct =
      enrollments.length > 0
        ? Math.round((enrollments.reduce((s, e) => s + e.progressPct, 0) / enrollments.length) * 100) / 100
        : 0;

    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const atRiskParticipants = enrollments.filter(
      (e) =>
        e.status === "ACTIVE" &&
        e.progressPct < 30 &&
        e.enrolledAt < fourteenDaysAgo,
    ).length;

    return {
      companyId,
      legalName: company.legalName,
      activeParticipants,
      seatsAvailable,
      seatsUsed,
      averageProgressPct,
      atRiskParticipants,
      upcomingLiveSessions: upcomingSessions.map((s) => ({
        courseTitle: s.course.title as Record<string, string>,
        startsAt: s.startsAt.toISOString(),
      })),
    };
  }

  async listMembers(companyId: string, filters: { team?: string; role?: string }) {
    return this.prisma.companyMembership.findMany({
      where: {
        companyId,
        status: { not: "REMOVED" },
        ...(filters.team ? { team: filters.team } : {}),
        ...(filters.role ? { role: filters.role as "COMPANY_ADMIN" | "PARTICIPANT" } : {}),
      },
      include: { user: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async inviteMember(companyId: string, inviterId: string, input: InviteCollaboratorInput) {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });

    let user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      const [firstName, ...rest] = input.email.split("@")[0].split(/[._-]/);
      user = await this.prisma.user.create({
        data: {
          email: input.email,
          firstName: firstName || "Nuevo",
          lastName: rest.join(" ") || "Colaborador",
        },
      });
    }

    const existingMembership = await this.prisma.companyMembership.findUnique({
      where: { companyId_userId: { companyId, userId: user.id } },
    });
    if (existingMembership && existingMembership.status !== "REMOVED") {
      throw new BadRequestException("El usuario ya es miembro de esta empresa");
    }

    const membership = existingMembership
      ? await this.prisma.companyMembership.update({
          where: { id: existingMembership.id },
          data: { status: "INVITED", role: input.role, team: input.team, invitedBy: inviterId },
        })
      : await this.prisma.companyMembership.create({
          data: {
            companyId,
            userId: user.id,
            role: input.role,
            team: input.team,
            invitedBy: inviterId,
            status: "INVITED",
          },
        });

    await this.notifications.sendCompanyInvite(user.email, company.legalName, user.id);
    return membership;
  }

  async removeMember(companyId: string, membershipId: string) {
    const membership = await this.prisma.companyMembership.findUnique({ where: { id: membershipId } });
    if (!membership || membership.companyId !== companyId) {
      throw new NotFoundException("Membresía no encontrada");
    }
    await this.prisma.companyMembership.update({ where: { id: membershipId }, data: { status: "REMOVED" } });
  }

  async listSeatPools(companyId: string) {
    const pools = await this.prisma.companySeatPool.findMany({
      where: { companyId },
      include: { course: { select: { title: true } }, program: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
    });
    return pools.map((p) => ({
      id: p.id,
      offeringKind: p.offeringKind,
      offeringTitle: (p.course?.title ?? p.program?.title ?? {}) as Record<string, string>,
      // Para poder armar el link de "comprar más cupos de esto mismo" desde
      // el frontend (/empresa/:id/cupos) sin otra llamada.
      courseId: p.courseId,
      programId: p.programId,
      seatsPurchased: p.seatsPurchased,
      seatsUsed: p.seatsUsed,
      expiresAt: p.expiresAt,
    }));
  }

  async assignSeat(companyId: string, poolId: string, userId: string) {
    const pool = await this.prisma.companySeatPool.findUnique({ where: { id: poolId } });
    if (!pool || pool.companyId !== companyId) throw new NotFoundException("Pool de cupos no encontrado");
    if (pool.seatsUsed >= pool.seatsPurchased) throw new BadRequestException("No quedan cupos disponibles");

    const membership = await this.prisma.companyMembership.findUnique({
      where: { companyId_userId: { companyId, userId } },
    });
    if (!membership || membership.status !== "ACTIVE") {
      throw new ForbiddenException("El usuario no es miembro activo de esta empresa");
    }

    // "Dos asignaciones de cupo simultáneas leían el mismo seatsUsed y las
    // dos pasaban la validación — el contador terminaba avanzando solo 1
    // neto pero se creaban 2 matrículas, sobre-otorgando cupos más allá de
    // lo comprado" — hallazgo de auditoría. Se reclama el cupo PRIMERO,
    // de forma atómica (el `where` con el tope es lo que hace que solo una
    // llamada concurrente pueda ganar), y solo si se ganó se crea la
    // matrícula — nunca al revés.
    const claimed = await this.prisma.companySeatPool.updateMany({
      where: { id: poolId, seatsUsed: { lt: pool.seatsPurchased } },
      data: { seatsUsed: { increment: 1 } },
    });
    if (claimed.count === 0) throw new BadRequestException("No quedan cupos disponibles");

    const enrollment = await this.prisma.enrollment.create({
      data: {
        userId,
        offeringKind: pool.offeringKind,
        courseId: pool.courseId,
        programId: pool.programId,
        companyId,
        source: "B2B_SEAT",
        accessExpiresAt: pool.expiresAt,
      },
    });

    if (pool.courseId) {
      const course = await this.prisma.course.findUnique({ where: { id: pool.courseId } });
      if (course) {
        await this.calendarService.scheduleForEnrollment(userId, course, pool.expiresAt ?? null);
        await this.enrollmentService.recomputeProgress(enrollment.id, pool.courseId, userId);
      }
    }

    return enrollment;
  }

  /**
   * Extiende la fecha de vencimiento de un pool de cupos (antes NO existía
   * ningún flujo de renovación — "comprar más cupos" solo sumaba
   * `seatsPurchased`, nunca tocaba `expiresAt`, así que un pool vencido
   * seguía vencido aunque se le compraran más cupos). Se extiende desde
   * hoy o desde el vencimiento actual, lo que sea más tarde — así una
   * renovación anticipada no "pierde" el tiempo que ya faltaba.
   */
  async renewSeatPool(companyId: string, poolId: string, months: number) {
    const pool = await this.prisma.companySeatPool.findUnique({ where: { id: poolId } });
    if (!pool || pool.companyId !== companyId) throw new NotFoundException("Pool de cupos no encontrado");

    const base = pool.expiresAt && pool.expiresAt.getTime() > Date.now() ? pool.expiresAt : new Date();
    const newExpiresAt = new Date(base);
    newExpiresAt.setMonth(newExpiresAt.getMonth() + months);

    return this.prisma.companySeatPool.update({ where: { id: poolId }, data: { expiresAt: newExpiresAt } });
  }

  async createSeatPool(
    companyId: string,
    input: { offeringKind: "COURSE" | "PROGRAM"; courseId?: string; programId?: string; seatsPurchased: number; expiresAt?: Date },
  ) {
    return this.prisma.companySeatPool.create({ data: { companyId, ...input } });
  }

  async getReports(companyId: string, filters: { area?: string; team?: string; courseId?: string }) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        companyId,
        ...(filters.courseId ? { courseId: filters.courseId } : {}),
        ...(filters.area ? { course: { area: { slug: filters.area } } } : {}),
      },
      include: { user: true, course: true, attempts: true },
    });

    const memberships = await this.prisma.companyMembership.findMany({ where: { companyId } });
    const teamByUserId = new Map(memberships.map((m) => [m.userId, m.team]));

    // Antes esta columna siempre mostraba "N/D" en el frontend porque el
    // reporte nunca calculaba asistencia — solo progreso y nota. Igual que
    // en CertificateService.checkAndIssueIfEligible: % de sesiones en vivo
    // del curso a las que el alumno efectivamente se unió.
    const courseIds = [...new Set(enrollments.map((e) => e.courseId).filter((id): id is string => Boolean(id)))];
    const sessionsByCourse = new Map<string, number>();
    if (courseIds.length > 0) {
      const sessionCounts = await this.prisma.liveSession.groupBy({
        by: ["courseId"],
        where: { courseId: { in: courseIds } },
        _count: { _all: true },
      });
      for (const s of sessionCounts) sessionsByCourse.set(s.courseId, s._count._all);
    }
    const attendanceRecords = await this.prisma.attendance.findMany({
      where: { userId: { in: enrollments.map((e) => e.userId) }, joinedAt: { not: null } },
      select: { userId: true, liveSession: { select: { courseId: true } } },
    });
    const attendedByUserCourse = new Map<string, number>();
    for (const a of attendanceRecords) {
      const key = `${a.userId}:${a.liveSession.courseId}`;
      attendedByUserCourse.set(key, (attendedByUserCourse.get(key) ?? 0) + 1);
    }

    const rows = enrollments
      .filter((e) => !filters.team || teamByUserId.get(e.userId) === filters.team)
      .map((e) => {
        const bestAttempt = e.attempts.reduce<(typeof e.attempts)[number] | null>((best, a) => {
          if (a.score === null) return best;
          if (!best || a.score > (best.score ?? -1)) return a;
          return best;
        }, null);
        const totalSessions = e.courseId ? sessionsByCourse.get(e.courseId) ?? 0 : 0;
        const attended = e.courseId ? attendedByUserCourse.get(`${e.userId}:${e.courseId}`) ?? 0 : 0;
        const attendancePct = totalSessions > 0 ? Math.round((attended / totalSessions) * 100) : null;
        // "Intentos fallidos" y "posible trampa" — antes el reporte solo
        // mostraba la mejor nota, sin decir cuántas veces lo intentó ni si
        // algún intento se marcó sospechoso (nota alta + tiempo de
        // resolución anormalmente corto, ver AssessmentService.submitAttempt).
        const attemptsCount = e.attempts.length;
        const failedAttemptsCount = e.attempts.filter((a) => a.status === "FAILED").length;
        const hasSuspiciousAttempt = e.attempts.some((a) => a.flaggedSuspicious);
        return {
          userId: e.userId,
          userName: `${e.user.firstName} ${e.user.lastName}`,
          team: teamByUserId.get(e.userId) ?? null,
          courseId: e.courseId,
          courseTitle: (e.course?.title as Record<string, string>) ?? null,
          progressPct: e.progressPct,
          bestScore: bestAttempt?.score ?? null,
          bestAttemptDurationSeconds: bestAttempt?.durationSeconds ?? null,
          attemptsCount,
          failedAttemptsCount,
          hasSuspiciousAttempt,
          attendancePct,
          status: e.status,
          // Para poder ordenar "quién acabó primero" — null si aún no completó.
          completedAt: e.completedAt?.toISOString() ?? null,
        };
      });

    return { total: rows.length, rows };
  }

  async requestQuote(companyId: string, requestedByUserId: string, input: RequestQuoteInput) {
    const description = [
      input.offeringDescription,
      `Contacto: ${input.legalName}${input.taxId ? ` (RUC/NIT ${input.taxId})` : ""}, ${input.contactEmail}${input.contactPhone ? `, ${input.contactPhone}` : ""}`,
    ].join("\n\n");

    return this.prisma.quote.create({
      data: { companyId, requestedByUserId, offeringDescription: description },
    });
  }

  // El `amount` de Prisma es un Decimal — serializado tal cual por JSON
  // llega como `{s,e,d}` (representación interna de decimal.js), no como
  // número, y `Number(amount)` en el frontend daba NaN. Se convierte acá a
  // string (mismo patrón que decimalToString ya usa en el resto de la API)
  // para que llegue al cliente como cualquier otro monto.
  private mapQuoteAmount<T extends { amount: unknown }>(quote: T): T {
    return { ...quote, amount: quote.amount === null ? null : decimalToString(quote.amount as never) };
  }

  async listQuotes(companyId: string) {
    const quotes = await this.prisma.quote.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } });
    return quotes.map((q) => this.mapQuoteAmount(q));
  }

  /**
   * "Facturación/cotización con pipeline comercial" (Fase 2) — antes un
   * Quote solo tenía el pedido inicial en texto libre, sin panel para que
   * ventas le diera seguimiento. Vista cross-empresa para /admin/cotizaciones,
   * con el nombre de la empresa ya resuelto (evita otro round-trip en el frontend).
   */
  async listAllQuotes() {
    const quotes = await this.prisma.quote.findMany({
      orderBy: { createdAt: "desc" },
      include: { company: { select: { legalName: true, taxId: true } } },
    });
    // IDs de curso/programa son referencias sueltas (sin @relation, ver
    // comentario en el schema) — se resuelven acá en una sola consulta cada
    // una en vez de traerlas anidadas.
    const courseIds = quotes.map((q) => q.courseId).filter((id): id is string => Boolean(id));
    const programIds = quotes.map((q) => q.programId).filter((id): id is string => Boolean(id));
    const [courses, programs] = await Promise.all([
      courseIds.length ? this.prisma.course.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } }) : [],
      programIds.length ? this.prisma.program.findMany({ where: { id: { in: programIds } }, select: { id: true, title: true } }) : [],
    ]);
    const courseTitleById = new Map(courses.map((c) => [c.id, c.title]));
    const programTitleById = new Map(programs.map((p) => [p.id, p.title]));
    return quotes.map((q) =>
      this.mapQuoteAmount({
        ...q,
        courseTitle: q.courseId ? (courseTitleById.get(q.courseId) as never) ?? null : null,
        programTitle: q.programId ? (programTitleById.get(q.programId) as never) ?? null : null,
      }),
    );
  }

  /**
   * Ventas fija el monto real, a qué oferta corresponde y hasta cuándo es
   * válida — pasa a SENT. `internalNotes` nunca se expone a la empresa (a
   * diferencia de `offeringDescription`, que escribió la propia empresa).
   */
  async respondToQuote(quoteId: string, input: RespondToQuoteInput) {
    const quote = await this.prisma.quote.findUnique({ where: { id: quoteId } });
    if (!quote) throw new NotFoundException("Cotización no encontrada");
    const updated = await this.prisma.quote.update({
      where: { id: quoteId },
      data: {
        courseId: input.courseId,
        programId: input.programId,
        seatsQuoted: input.seatsQuoted,
        amount: input.amount,
        currency: input.currency,
        validUntil: input.validUntil ? new Date(input.validUntil) : undefined,
        salesOwner: input.salesOwner,
        internalNotes: input.internalNotes,
        status: "SENT",
        respondedAt: new Date(),
      },
    });
    const requester = await this.prisma.user.findUnique({ where: { id: quote.requestedByUserId } });
    if (requester) {
      await this.notifications.sendQuoteResponded(requester.email, updated.amount ? Number(updated.amount) : 0, updated.currency ?? "PEN", requester.id);
    }
    return this.mapQuoteAmount(updated);
  }

  /**
   * La empresa acepta o rechaza — solo tiene sentido sobre una cotización
   * ya respondida (SENT); no se puede "aceptar" algo que todavía no tiene
   * monto fijado.
   */
  async updateQuoteStatus(companyId: string, quoteId: string, status: "ACCEPTED" | "REJECTED") {
    const quote = await this.prisma.quote.findUnique({ where: { id: quoteId } });
    if (!quote || quote.companyId !== companyId) throw new NotFoundException("Cotización no encontrada");
    if (quote.status !== "SENT") throw new BadRequestException("Solo se puede responder a una cotización que ya fue enviada por ventas");
    const updated = await this.prisma.quote.update({ where: { id: quoteId }, data: { status } });
    return this.mapQuoteAmount(updated);
  }

  /**
   * Cierra el círculo del pipeline: una cotización ACEPTADA se convierte en
   * cupos B2B reales (mismo `createSeatPool` que usa el alta manual) — sin
   * esto, aceptar una cotización no tenía ningún efecto real en el sistema,
   * era solo una etiqueta.
   */
  async convertQuoteToSeatPool(quoteId: string) {
    const quote = await this.prisma.quote.findUnique({ where: { id: quoteId } });
    if (!quote) throw new NotFoundException("Cotización no encontrada");
    if (quote.status !== "ACCEPTED") throw new BadRequestException("Solo se puede convertir una cotización aceptada");
    if (quote.convertedSeatPoolId) throw new BadRequestException("Esta cotización ya se convirtió en cupos");
    if (!quote.seatsQuoted || (!quote.courseId && !quote.programId)) {
      throw new BadRequestException("A esta cotización le falta el curso/programa o la cantidad de cupos para poder convertirla");
    }
    const pool = await this.createSeatPool(quote.companyId, {
      offeringKind: quote.courseId ? "COURSE" : "PROGRAM",
      courseId: quote.courseId ?? undefined,
      programId: quote.programId ?? undefined,
      seatsPurchased: quote.seatsQuoted,
      expiresAt: quote.validUntil ?? undefined,
    });
    await this.prisma.quote.update({ where: { id: quoteId }, data: { convertedSeatPoolId: pool.id } });
    return pool;
  }
}

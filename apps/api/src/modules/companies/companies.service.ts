import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@inkademy/db";
import type { CompanyDashboardSummaryDTO, CreateCompanyInput, InviteCollaboratorInput, RequestQuoteInput } from "@inkademy/shared";
import { PRISMA } from "../../common/prisma/prisma.module";
import { CalendarService } from "../calendar/calendar.service";
import { NotificationService } from "../notification/notification.service";

@Injectable()
export class CompaniesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly calendarService: CalendarService,
    private readonly notifications: NotificationService,
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
    return company;
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
    await this.prisma.companySeatPool.update({ where: { id: poolId }, data: { seatsUsed: pool.seatsUsed + 1 } });

    if (pool.courseId) {
      const course = await this.prisma.course.findUnique({ where: { id: pool.courseId } });
      if (course) await this.calendarService.scheduleForEnrollment(userId, course, pool.expiresAt ?? null);
    }

    return enrollment;
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
        const bestScore = e.attempts.reduce<number | null>((best, a) => {
          if (a.score === null) return best;
          return best === null ? a.score : Math.max(best, a.score);
        }, null);
        const totalSessions = e.courseId ? sessionsByCourse.get(e.courseId) ?? 0 : 0;
        const attended = e.courseId ? attendedByUserCourse.get(`${e.userId}:${e.courseId}`) ?? 0 : 0;
        const attendancePct = totalSessions > 0 ? Math.round((attended / totalSessions) * 100) : null;
        return {
          userId: e.userId,
          userName: `${e.user.firstName} ${e.user.lastName}`,
          team: teamByUserId.get(e.userId) ?? null,
          courseId: e.courseId,
          courseTitle: (e.course?.title as Record<string, string>) ?? null,
          progressPct: e.progressPct,
          bestScore,
          attendancePct,
          status: e.status,
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

  async listQuotes(companyId: string) {
    return this.prisma.quote.findMany({ where: { companyId }, orderBy: { createdAt: "desc" } });
  }
}

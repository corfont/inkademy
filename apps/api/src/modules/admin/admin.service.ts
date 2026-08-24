import { randomUUID } from "node:crypto";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@inkademy/db";
import type { AdminExceptionDTO } from "@inkademy/shared";
import { PRISMA } from "../../common/prisma/prisma.module";
import { decimalToString } from "../../common/utils/money";
import { StorageService } from "../../storage/storage.service";

@Injectable()
export class AdminService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly storageService: StorageService,
  ) {}

  async getKpis() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const [
      salesLast30d,
      totalPaidOrders,
      totalEnrollments,
      enrollmentsBySource,
      activeStudents,
      atRiskEnrollments,
      certificatesIssued,
      ticketsByStatus,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: { status: "PAID", createdAt: { gte: thirtyDaysAgo } },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.order.count({ where: { status: "PAID" } }),
      this.prisma.enrollment.count(),
      this.prisma.enrollment.groupBy({ by: ["source"], _count: { source: true } }),
      this.prisma.enrollment.findMany({ where: { status: "ACTIVE" }, distinct: ["userId"], select: { userId: true } }),
      this.prisma.enrollment.count({
        where: { status: "ACTIVE", progressPct: { lt: 30 }, enrolledAt: { lt: fourteenDaysAgo } },
      }),
      this.prisma.certificate.count({ where: { revoked: false } }),
      this.prisma.supportTicket.groupBy({ by: ["status"], _count: { status: true } }),
    ]);

    return {
      sales: {
        last30dTotal: decimalToString(salesLast30d._sum.total ?? 0),
        last30dOrders: salesLast30d._count,
        totalPaidOrders,
      },
      enrollments: {
        total: totalEnrollments,
        bySource: enrollmentsBySource.map((r) => ({ source: r.source, count: r._count.source })),
      },
      students: {
        active: activeStudents.length,
        atRisk: atRiskEnrollments,
      },
      certificatesIssued,
      tickets: ticketsByStatus.map((r) => ({ status: r.status, count: r._count.status })),
    };
  }

  /**
   * Las 5 reglas de excepción del "trabajo por excepción" de Inkademy.
   * Todas se calculan contra datos reales de la BD (nada hardcodeado).
   */
  async getExceptions(): Promise<AdminExceptionDTO[]> {
    const exceptions: AdminExceptionDTO[] = [];
    const now = new Date();

    // 1) PAYMENT_WITHOUT_ENROLLMENT — Payment SUCCEEDED pero la Order asociada
    //    no quedó en PAID (falló la finalización: matrícula/seat pool no se creó).
    const succeededPaymentsWithoutPaidOrder = await this.prisma.payment.findMany({
      where: { status: "SUCCEEDED", order: { status: { not: "PAID" } } },
      include: { order: true },
    });
    for (const p of succeededPaymentsWithoutPaidOrder) {
      exceptions.push({
        id: `PAYMENT_WITHOUT_ENROLLMENT:${p.id}`,
        type: "PAYMENT_WITHOUT_ENROLLMENT",
        severity: "HIGH",
        message: `El pago ${p.id} de la orden ${p.orderId} se acreditó pero la orden quedó en estado ${p.order.status} (sin matrícula generada)`,
        entityId: p.orderId,
        createdAt: p.createdAt.toISOString(),
      });
    }

    // 2) STUDENT_WITHOUT_ACCESS_BEFORE_CLASS — clase en vivo en las próximas 48h
    //    con alumnos matriculados cuyo acceso ya venció o vence antes de la clase.
    const upcomingSessions = await this.prisma.liveSession.findMany({
      where: {
        status: "SCHEDULED",
        startsAt: { gte: now, lte: new Date(now.getTime() + 48 * 60 * 60 * 1000) },
      },
      include: { course: true },
    });
    for (const session of upcomingSessions) {
      const affected = await this.prisma.enrollment.findMany({
        where: {
          courseId: session.courseId,
          offeringKind: "COURSE",
          status: { not: "CANCELLED" },
          OR: [{ status: "EXPIRED" }, { accessExpiresAt: { lte: session.startsAt } }],
        },
        include: { user: true },
      });
      for (const enrollment of affected) {
        exceptions.push({
          id: `STUDENT_WITHOUT_ACCESS_BEFORE_CLASS:${enrollment.id}:${session.id}`,
          type: "STUDENT_WITHOUT_ACCESS_BEFORE_CLASS",
          severity: "HIGH",
          message: `${enrollment.user.firstName} ${enrollment.user.lastName} tiene la clase "${(session.course.title as Record<string, string>).es}" el ${session.startsAt.toLocaleString("es-PE")} pero su acceso está vencido/por vencer`,
          entityId: enrollment.id,
          createdAt: now.toISOString(),
        });
      }
    }

    // 3) COURSE_WITHOUT_TEACHER — curso publicado sin ningún CourseStaff role=TEACHER.
    const publishedCourses = await this.prisma.course.findMany({
      where: { status: "PUBLISHED" },
      include: { staff: true },
    });
    for (const course of publishedCourses) {
      if (!course.staff.some((s) => s.role === "TEACHER")) {
        exceptions.push({
          id: `COURSE_WITHOUT_TEACHER:${course.id}`,
          type: "COURSE_WITHOUT_TEACHER",
          severity: "MEDIUM",
          message: `El curso "${(course.title as Record<string, string>).es}" está publicado pero no tiene un docente asignado`,
          entityId: course.id,
          createdAt: course.createdAt.toISOString(),
        });
      }
    }

    // 4) COMPANY_SEATS_EXPIRING — cupos B2B sin usar que vencen en los próximos 30 días.
    const expiringPools = await this.prisma.companySeatPool.findMany({
      where: {
        expiresAt: { gte: now, lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) },
      },
      include: { company: true },
    });
    for (const pool of expiringPools) {
      const unused = pool.seatsPurchased - pool.seatsUsed;
      if (unused > 0) {
        exceptions.push({
          id: `COMPANY_SEATS_EXPIRING:${pool.id}`,
          type: "COMPANY_SEATS_EXPIRING",
          severity: unused > 5 ? "HIGH" : "MEDIUM",
          message: `${pool.company.legalName} tiene ${unused} cupo(s) sin usar que vencen el ${pool.expiresAt?.toLocaleDateString("es-PE")}`,
          entityId: pool.id,
          createdAt: now.toISOString(),
        });
      }
    }

    // 5) EXAM_PENDING_REVIEW — intentos con preguntas abiertas/cortas pendientes de calificar.
    const pendingAttempts = await this.prisma.assessmentAttempt.findMany({
      where: { status: "PENDING_REVIEW" },
      include: { assessment: { include: { course: true } }, user: true },
    });
    for (const attempt of pendingAttempts) {
      const hoursSinceSubmit = attempt.submittedAt
        ? (now.getTime() - attempt.submittedAt.getTime()) / (1000 * 60 * 60)
        : 0;
      exceptions.push({
        id: `EXAM_PENDING_REVIEW:${attempt.id}`,
        type: "EXAM_PENDING_REVIEW",
        severity: hoursSinceSubmit > 48 ? "HIGH" : hoursSinceSubmit > 24 ? "MEDIUM" : "LOW",
        message: `El intento de ${attempt.user.firstName} ${attempt.user.lastName} en "${(attempt.assessment.title as Record<string, string>).es}" tiene preguntas abiertas sin calificar`,
        entityId: attempt.id,
        createdAt: (attempt.submittedAt ?? attempt.startedAt).toISOString(),
      });
    }

    return exceptions.sort((a, b) => {
      const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return order[a.severity] - order[b.severity];
    });
  }

  // --- Catálogo ---

  listAreas() {
    return this.prisma.area.findMany({ orderBy: { order: "asc" } });
  }

  createArea(input: { slug: string; name: object; icon?: string; order?: number }) {
    return this.prisma.area.create({ data: input });
  }

  updateArea(id: string, input: Partial<{ slug: string; name: object; icon?: string; order?: number }>) {
    return this.prisma.area.update({ where: { id }, data: input });
  }

  listCourses(params: { page?: number; pageSize?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, params.pageSize ?? 20);
    return this.prisma.course.findMany({
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: { area: true },
    });
  }

  createCourse(input: Record<string, unknown>) {
    return this.prisma.course.create({ data: input as never });
  }

  updateCourse(id: string, input: Record<string, unknown>) {
    return this.prisma.course.update({ where: { id }, data: input as never });
  }

  async getCourseDetail(id: string) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        area: true,
        modules: { orderBy: { order: "asc" }, include: { lessons: { orderBy: { order: "asc" }, include: { materials: true } } } },
        liveSessions: { orderBy: { startsAt: "asc" } },
      },
    });
    if (!course) throw new NotFoundException("Curso no encontrado");
    // Decimal de Prisma no serializa a JSON como número plano por defecto
    // (llega como {s,e,d} internos) — normalizamos antes de devolverlo.
    return {
      ...course,
      priceAmount: decimalToString(course.priceAmount),
      b2bPriceAmount: course.b2bPriceAmount ? decimalToString(course.b2bPriceAmount) : null,
    };
  }

  // --- Contenido: módulos / lecciones / materiales ---

  createModule(courseId: string, input: { title: object; order?: number }) {
    return this.prisma.courseModule.create({ data: { courseId, title: input.title, order: input.order ?? 0 } });
  }

  updateModule(id: string, input: Partial<{ title: object; order: number }>) {
    return this.prisma.courseModule.update({ where: { id }, data: input });
  }

  async deleteModule(id: string) {
    await this.prisma.courseModule.delete({ where: { id } });
    return { deleted: true };
  }

  createLesson(
    moduleId: string,
    input: {
      title: object;
      order?: number;
      contentType: "VIDEO" | "PDF" | "LINK" | "TEXT";
      videoAssetId?: string;
      durationMinutes?: number;
      isFreePreview?: boolean;
    },
  ) {
    return this.prisma.lesson.create({ data: { moduleId, ...input, order: input.order ?? 0 } as never });
  }

  updateLesson(id: string, input: Record<string, unknown>) {
    return this.prisma.lesson.update({ where: { id }, data: input as never });
  }

  async deleteLesson(id: string) {
    await this.prisma.lesson.delete({ where: { id } });
    return { deleted: true };
  }

  createMaterial(lessonId: string, input: { title: string; assetId: string; kind: string }) {
    return this.prisma.material.create({ data: { lessonId, ...input } });
  }

  async deleteMaterial(id: string) {
    await this.prisma.material.delete({ where: { id } });
    return { deleted: true };
  }

  /** Sube un archivo (material/video/portada) a S3/MinIO y devuelve el assetId + una URL para previsualizarlo. */
  async uploadAsset(file: { originalname: string; buffer: Buffer; mimetype: string }) {
    const key = `admin-uploads/${randomUUID()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await this.storageService.uploadBuffer(key, file.buffer, file.mimetype);
    const url = this.storageService.getPublicUrl(key) ?? (await this.storageService.getSignedUrl(key, 60 * 60 * 24 * 7));
    return { assetId: key, url };
  }

  listPrograms() {
    return this.prisma.program.findMany({ include: { courses: true }, orderBy: { createdAt: "desc" } });
  }

  async createProgram(input: { courseIds?: string[] } & Record<string, unknown>) {
    const { courseIds, ...rest } = input;
    return this.prisma.program.create({
      data: {
        ...rest,
        ...(courseIds
          ? { courses: { create: courseIds.map((courseId, i) => ({ courseId, order: i, isRequired: true })) } }
          : {}),
      } as never,
    });
  }

  async updateProgram(id: string, input: { courseIds?: string[] } & Record<string, unknown>) {
    const { courseIds, ...rest } = input;
    if (courseIds) {
      await this.prisma.programCourse.deleteMany({ where: { programId: id } });
      await this.prisma.programCourse.createMany({
        data: courseIds.map((courseId, i) => ({ programId: id, courseId, order: i, isRequired: true })),
      });
    }
    return this.prisma.program.update({ where: { id }, data: rest as never });
  }

  // --- Plantillas de certificado ---

  listCertificateTemplates() {
    return this.prisma.certificateTemplate.findMany({ orderBy: { createdAt: "desc" } });
  }

  async createCertificateTemplate(input: { name: string; locale?: string; htmlTemplate: string; active?: boolean }) {
    const previousVersion = await this.prisma.certificateTemplate.findFirst({
      where: { name: input.name },
      orderBy: { version: "desc" },
    });
    return this.prisma.certificateTemplate.create({
      data: {
        name: input.name,
        locale: input.locale ?? "es",
        htmlTemplate: input.htmlTemplate,
        active: input.active ?? true,
        version: (previousVersion?.version ?? 0) + 1,
      },
    });
  }

  updateCertificateTemplate(id: string, input: Partial<{ name: string; htmlTemplate: string; active: boolean }>) {
    return this.prisma.certificateTemplate.update({ where: { id }, data: input });
  }

  // --- Empresas ---

  listCompanies() {
    return this.prisma.company.findMany({ orderBy: { createdAt: "desc" } });
  }
}

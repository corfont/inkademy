import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
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
      enrollmentsByCourse,
      revenueByCompany,
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
      // Cursos más solicitados — antes no existía ningún KPI de "qué se
      // vende más", solo ventas/matrículas/alumnos agregados en total.
      this.prisma.enrollment.groupBy({
        by: ["courseId"],
        where: { courseId: { not: null }, offeringKind: "COURSE" },
        _count: { courseId: true },
        orderBy: { _count: { courseId: "desc" } },
        take: 5,
      }),
      // Empresas que más compran — idem, no existía ningún ranking por cliente.
      this.prisma.order.groupBy({
        by: ["companyId"],
        where: { status: "PAID", companyId: { not: null } },
        _sum: { total: true },
        orderBy: { _sum: { total: "desc" } },
        take: 5,
      }),
    ]);

    const [courses, companies] = await Promise.all([
      this.prisma.course.findMany({
        where: { id: { in: enrollmentsByCourse.map((c) => c.courseId).filter((id): id is string => Boolean(id)) } },
        select: { id: true, title: true },
      }),
      this.prisma.company.findMany({
        where: { id: { in: revenueByCompany.map((c) => c.companyId).filter((id): id is string => Boolean(id)) } },
        select: { id: true, legalName: true },
      }),
    ]);
    const courseTitleById = new Map(courses.map((c) => [c.id, c.title as Record<string, string>]));
    const companyNameById = new Map(companies.map((c) => [c.id, c.legalName]));

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
      topCourses: enrollmentsByCourse.map((c) => ({
        courseId: c.courseId,
        title: c.courseId ? courseTitleById.get(c.courseId) ?? null : null,
        enrollments: c._count.courseId,
      })),
      topCompanies: revenueByCompany.map((c) => ({
        companyId: c.companyId,
        legalName: c.companyId ? companyNameById.get(c.companyId) ?? "—" : "—",
        totalPaid: decimalToString(c._sum.total ?? 0),
      })),
    };
  }

  /**
   * Datos para los gráficos del dashboard (antes el panel era 100% texto:
   * tarjetas de números y listas — sin tendencia en el tiempo ni
   * distribución visual de nada). Todo real, agregado directo de la BD.
   */
  async getKpiCharts() {
    const [revenueByMonth, enrollmentsByMonth, enrollmentsByStatus, coursesByArea] = await Promise.all([
      this.prisma.$queryRaw<Array<{ month: Date; total: string }>>`
        SELECT date_trunc('month', "createdAt") as month, COALESCE(SUM(total), 0) as total
        FROM "Order"
        WHERE status = 'PAID' AND "createdAt" >= now() - interval '6 months'
        GROUP BY month ORDER BY month ASC
      `,
      this.prisma.$queryRaw<Array<{ month: Date; count: bigint }>>`
        SELECT date_trunc('month', "enrolledAt") as month, COUNT(*) as count
        FROM "Enrollment"
        WHERE "enrolledAt" >= now() - interval '6 months'
        GROUP BY month ORDER BY month ASC
      `,
      this.prisma.enrollment.groupBy({ by: ["status"], _count: { status: true } }),
      this.prisma.course.groupBy({ by: ["areaId"], where: { status: "PUBLISHED" }, _count: { areaId: true } }),
    ]);

    const areas = await this.prisma.area.findMany({ where: { id: { in: coursesByArea.map((c) => c.areaId) } } });
    const areaNameById = new Map(areas.map((a) => [a.id, (a.name as Record<string, string>).es ?? a.slug]));

    return {
      revenueByMonth: revenueByMonth.map((r) => ({ month: r.month.toISOString().slice(0, 7), total: Number(r.total) })),
      enrollmentsByMonth: enrollmentsByMonth.map((r) => ({ month: r.month.toISOString().slice(0, 7), count: Number(r.count) })),
      enrollmentsByStatus: enrollmentsByStatus.map((r) => ({ status: r.status, count: r._count.status })),
      coursesByArea: coursesByArea.map((c) => ({ area: areaNameById.get(c.areaId) ?? "—", count: c._count.areaId })),
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

  /** `teacherUserId`: si viene, acota a los cursos donde ese usuario es CourseStaff (panel de docente). */
  async listCourses(params: { page?: number; pageSize?: number }, teacherUserId?: string) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, params.pageSize ?? 20);
    const courses = await this.prisma.course.findMany({
      where: teacherUserId ? { staff: { some: { userId: teacherUserId } } } : undefined,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: { area: true },
    });
    // Antes /admin/catalogo no traía ninguna URL previsualizable de la
    // portada (solo el coverImageAssetId crudo) — la lista nunca podía
    // mostrar la imagen del curso, pedido explícito ("que se vea la
    // imagen del curso al costadito").
    return courses.map((c) => ({
      ...c,
      coverImageUrl: c.coverImageAssetId ? this.storageService.getPublicUrl(c.coverImageAssetId) : null,
    }));
  }

  /** Resumen para /docente: cursos asignados, próximas sesiones a dictar, cola de calificación pendiente. */
  async getTeacherDashboard(teacherUserId: string) {
    const [courses, upcomingLiveSessions, pendingReviewCount] = await Promise.all([
      this.prisma.course.findMany({
        where: { staff: { some: { userId: teacherUserId } } },
        include: { area: true },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.liveSession.findMany({
        where: { course: { staff: { some: { userId: teacherUserId } } }, startsAt: { gt: new Date() }, status: "SCHEDULED" },
        include: { course: true },
        orderBy: { startsAt: "asc" },
        take: 10,
      }),
      this.prisma.answer.count({
        where: {
          isCorrect: null,
          question: { type: { in: ["OPEN", "SHORT_ANSWER"] } },
          attempt: { assessment: { course: { staff: { some: { userId: teacherUserId } } } } },
        },
      }),
    ]);
    return {
      courses: courses.map((c) => ({ id: c.id, slug: c.slug, title: c.title, status: c.status, areaName: c.area?.name })),
      upcomingLiveSessions: upcomingLiveSessions.map((s) => ({
        id: s.id,
        courseId: s.courseId,
        courseTitle: s.course.title,
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
        joinUrl: s.joinUrl,
      })),
      pendingReviewCount,
    };
  }

  /** Verifica que un TEACHER sea CourseStaff del curso antes de dejarlo ver/editar — ADMIN/SUPPORT (teacherUserId undefined) no tiene esta restricción. */
  private async assertTeacherOwnsCourse(courseId: string, teacherUserId: string) {
    const membership = await this.prisma.courseStaff.findFirst({ where: { courseId, userId: teacherUserId } });
    if (!membership) throw new ForbiddenException("No tienes asignado este curso");
  }

  createCourse(input: Record<string, unknown>) {
    return this.prisma.course.create({ data: input as never });
  }

  async updateCourse(id: string, input: Record<string, unknown>, teacherUserId?: string) {
    if (teacherUserId) await this.assertTeacherOwnsCourse(id, teacherUserId);
    return this.prisma.course.update({ where: { id }, data: input as never });
  }

  async getCourseDetail(id: string, teacherUserId?: string) {
    if (teacherUserId) await this.assertTeacherOwnsCourse(id, teacherUserId);
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        area: true,
        modules: {
          orderBy: { order: "asc" },
          include: {
            lessons: { orderBy: { order: "asc" }, include: { materials: { orderBy: { createdAt: "asc" } } } },
            materials: { orderBy: { createdAt: "asc" } },
          },
        },
        liveSessions: { orderBy: { startsAt: "asc" } },
      },
    });
    if (!course) throw new NotFoundException("Curso no encontrado");
    const withAssetUrl = <T extends { assetId: string }>(m: T) => ({ ...m, assetUrl: this.storageService.getPublicUrl(m.assetId) });
    // Decimal de Prisma no serializa a JSON como número plano por defecto
    // (llega como {s,e,d} internos) — normalizamos antes de devolverlo.
    return {
      ...course,
      priceAmount: decimalToString(course.priceAmount),
      b2bPriceAmount: course.b2bPriceAmount ? decimalToString(course.b2bPriceAmount) : null,
      // El editor de curso (CourseEditor) solo tenía coverImageAssetId (la
      // key S3 cruda, no una URL mostrable) — sin esto no podía previsualizar
      // la portada ya subida. catalog.service.ts ya hace esta misma
      // resolución para el catálogo público.
      coverImageUrl: course.coverImageAssetId ? this.storageService.getPublicUrl(course.coverImageAssetId) : null,
      syllabusUrl: course.syllabusAssetId ? this.storageService.getPublicUrl(course.syllabusAssetId) : null,
      // Materiales (de módulo y de lección) tampoco traían URL previsualizable
      // — el admin solo veía el nombre del archivo, no podía abrirlo.
      modules: course.modules.map((m) => ({
        ...m,
        materials: m.materials.map(withAssetUrl),
        lessons: m.lessons.map((l) => ({ ...l, materials: l.materials.map(withAssetUrl) })),
      })),
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

  createMaterial(
    lessonId: string,
    input: { title: string; assetId: string; kind: string; category?: string; visible?: boolean },
  ) {
    return this.prisma.material.create({ data: { lessonId, ...input } as never });
  }

  /** Lectura/documento a nivel de módulo entero (no de una lección puntual) — ver Material.moduleId. */
  createModuleMaterial(
    moduleId: string,
    input: { title: string; assetId: string; kind: string; category?: string; visible?: boolean },
  ) {
    return this.prisma.material.create({ data: { moduleId, ...input } as never });
  }

  updateMaterial(id: string, input: Record<string, unknown>) {
    return this.prisma.material.update({ where: { id }, data: input as never });
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

  async createCertificateTemplate(input: {
    name: string;
    locale?: string;
    htmlTemplate?: string;
    active?: boolean;
    sourceType?: "HTML" | "BACKGROUND";
    backgroundAssetId?: string | null;
    backgroundMimeType?: string | null;
    pageWidthPt?: number;
    pageHeightPt?: number;
    tagPositions?: unknown;
  }) {
    if ((input.sourceType ?? "HTML") === "HTML" && !input.htmlTemplate?.trim()) {
      throw new BadRequestException("El HTML de la plantilla es obligatorio para plantillas de tipo HTML");
    }
    if (input.sourceType === "BACKGROUND" && !input.backgroundAssetId) {
      throw new BadRequestException("Falta subir el archivo de fondo (PDF/PNG/JPG) de la plantilla");
    }
    const previousVersion = await this.prisma.certificateTemplate.findFirst({
      where: { name: input.name },
      orderBy: { version: "desc" },
    });
    return this.prisma.certificateTemplate.create({
      data: {
        name: input.name,
        locale: input.locale ?? "es",
        htmlTemplate: input.htmlTemplate ?? "",
        active: input.active ?? true,
        version: (previousVersion?.version ?? 0) + 1,
        sourceType: input.sourceType ?? "HTML",
        backgroundAssetId: input.backgroundAssetId,
        backgroundMimeType: input.backgroundMimeType,
        pageWidthPt: input.pageWidthPt,
        pageHeightPt: input.pageHeightPt,
        tagPositions: input.tagPositions as never,
      },
    });
  }

  updateCertificateTemplate(id: string, input: Record<string, unknown>) {
    return this.prisma.certificateTemplate.update({ where: { id }, data: input as never });
  }

  // --- Empresas ---

  // Antes devolvía la fila `Company` cruda sin `seatsUsed` (el frontend de
  // /admin/empresas dependía del fallback simulado para esa columna). Ahora
  // se agrega en una sola consulta adicional agrupando CompanySeatPool.
  async listCompanies() {
    const [companies, seatSums] = await Promise.all([
      this.prisma.company.findMany({ orderBy: { createdAt: "desc" } }),
      this.prisma.companySeatPool.groupBy({ by: ["companyId"], _sum: { seatsUsed: true, seatsPurchased: true } }),
    ]);
    const seatsByCompany = new Map(seatSums.map((s) => [s.companyId, s._sum]));
    return companies.map((c) => ({
      ...c,
      seatsUsed: seatsByCompany.get(c.id)?.seatsUsed ?? 0,
      seatsPurchased: seatsByCompany.get(c.id)?.seatsPurchased ?? 0,
    }));
  }

  // --- Órdenes (para poder ubicar una orden y cancelarla — ver
  // CommerceService.cancelOrder — sin tener que consultar la BD a mano) ---

  async listOrders(q?: string) {
    const orders = await this.prisma.order.findMany({
      where: q
        ? {
            OR: [
              { id: q },
              { user: { email: { contains: q, mode: "insensitive" } } },
              { buyerLegalName: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      include: { user: true, electronicInvoice: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return orders.map((o) => ({
      id: o.id,
      status: o.status,
      total: decimalToString(o.total),
      currency: o.currency,
      userEmail: o.user.email,
      buyerLegalName: o.buyerLegalName,
      invoiceStatus: o.electronicInvoice?.status ?? null,
      createdAt: o.createdAt.toISOString(),
    }));
  }

  // ==========================================================================
  // Finanzas — antes no existía ningún lugar para ver cuánto entra, cuánto
  // se va en IGV/comisión de pasarela, y cuánto queda de saldo real. Todo
  // se agrega a partir de datos ya existentes (Order/Payment pagados +
  // SunatSettings.taxAffectation) más PlatformExpense (gastos que el admin
  // registra a mano — hosting, marketing, etc., nada de eso lo modela el
  // sistema todavía).
  // ==========================================================================

  async getFinancialSummary(params: { from?: string; to?: string } = {}) {
    const from = params.from ? new Date(params.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = params.to ? new Date(params.to) : new Date();

    const [ordersByCurrency, paymentsByCurrencyProvider, expensesByCurrency, sunat, platformSettings] = await Promise.all([
      this.prisma.order.groupBy({ by: ["currency"], where: { status: "PAID", createdAt: { gte: from, lte: to } }, _sum: { total: true } }),
      this.prisma.payment.groupBy({
        by: ["currency", "provider"],
        where: { status: "SUCCEEDED", createdAt: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
      this.prisma.platformExpense.groupBy({ by: ["currency"], where: { incurredAt: { gte: from, lte: to } }, _sum: { amount: true } }),
      this.prisma.sunatSettings.findUnique({ where: { id: "default" } }),
      this.prisma.platformSettings.findUnique({ where: { id: "default" } }),
    ]);

    const taxAffectation = (sunat?.taxAffectation as "EXONERADO" | "GRAVADO" | undefined) ?? "EXONERADO";
    const isGravado = taxAffectation === "GRAVADO";
    // 18% es la tasa vigente en Perú desde 2011, pero el Estado puede
    // cambiarla — parametrizable en vez de hardcodeada (mismo valor que usa
    // apps/worker para el XML real de boleta/factura, ver SunatSettings.igvPercent).
    const igvPercent = sunat?.igvPercent ?? 18;
    const culqiFeePercent = platformSettings?.culqiFeePercent ?? 3.99;
    const stripeFeePercent = platformSettings?.stripeFeePercent ?? 4.99;
    const detractionEnabled = platformSettings?.detractionEnabled ?? false;
    const detractionPercent = platformSettings?.detractionPercent ?? 0;

    const feesByCurrency = new Map<string, number>();
    for (const p of paymentsByCurrencyProvider) {
      const pct = p.provider === "CULQI" ? culqiFeePercent : p.provider === "STRIPE" ? stripeFeePercent : 0;
      feesByCurrency.set(p.currency, (feesByCurrency.get(p.currency) ?? 0) + Number(p._sum.amount ?? 0) * (pct / 100));
    }
    const incomeByCurrency = new Map(ordersByCurrency.map((o) => [o.currency, Number(o._sum.total ?? 0)]));
    const expensesMap = new Map(expensesByCurrency.map((e) => [e.currency, Number(e._sum.amount ?? 0)]));

    const currencies = new Set<string>(["PEN", ...ordersByCurrency.map((o) => o.currency), ...expensesByCurrency.map((e) => e.currency)]);

    const rows = Array.from(currencies).map((currency) => {
      const income = incomeByCurrency.get(currency) ?? 0;
      // "Todo curso se le debe aplicar IGV si es nacional y si es
      // internacional no sé qué se le aplica" — el IGV (taxAffectation)
      // solo se calcula sobre ventas en PEN (rieles nacionales, Culqi). Una
      // venta en USD (comprador internacional, Stripe) se trata como
      // exportación de servicios — 0% por defecto, criterio general pero
      // que DEBE confirmarse con un contador según el caso — nunca se le
      // aplica el mismo IGV que a una venta nacional.
      const igv = currency === "PEN" && isGravado ? income - income / (1 + igvPercent / 100) : 0;
      // Detracción SUNAT — apagada por defecto (ver comentario del schema);
      // solo se resta si el admin la activó explícitamente. Tampoco aplica
      // a ventas internacionales.
      const detraction = currency === "PEN" && detractionEnabled ? income * (detractionPercent / 100) : 0;
      const providerFees = feesByCurrency.get(currency) ?? 0;
      const otherExpenses = expensesMap.get(currency) ?? 0;
      return {
        currency,
        income,
        igv,
        detraction,
        providerFees,
        otherExpenses,
        balance: income - igv - detraction - providerFees - otherExpenses,
      };
    });

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      taxAffectation,
      igvPercent,
      culqiFeePercent,
      stripeFeePercent,
      detractionEnabled,
      detractionPercent,
      rows,
    };
  }

  async updateFeeSettings(input: {
    culqiFeePercent?: number;
    stripeFeePercent?: number;
    detractionEnabled?: boolean;
    detractionPercent?: number;
  }) {
    return this.prisma.platformSettings.upsert({ where: { id: "default" }, create: { id: "default", ...input }, update: input });
  }

  async listExpenses(params: { from?: string; to?: string } = {}) {
    const expenses = await this.prisma.platformExpense.findMany({
      where:
        params.from || params.to
          ? { incurredAt: { ...(params.from ? { gte: new Date(params.from) } : {}), ...(params.to ? { lte: new Date(params.to) } : {}) } }
          : undefined,
      orderBy: { incurredAt: "desc" },
      take: 200,
    });
    // Decimal de Prisma no serializa a JSON como número plano por defecto
    // (mismo caso que Order/Course en otros lados de este archivo) — sin
    // esto el frontend mostraba "S/ NaN" en vez del monto real.
    return expenses.map((e) => ({ ...e, amount: decimalToString(e.amount), incurredAt: e.incurredAt.toISOString() }));
  }

  createExpense(input: {
    description: string;
    amount: number;
    currency?: string;
    category?: string;
    incurredAt?: string;
    recurrence?: string;
  }) {
    return this.prisma.platformExpense.create({
      data: {
        description: input.description,
        amount: input.amount,
        currency: input.currency ?? "PEN",
        category: input.category ?? "OTHER",
        recurrence: input.recurrence ?? "ONCE",
        ...(input.incurredAt ? { incurredAt: new Date(input.incurredAt) } : {}),
      },
    });
  }

  async deleteExpense(id: string) {
    await this.prisma.platformExpense.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Estado de resultados (P&L) mensual + punto de equilibrio + pronóstico
   * simple — "sería bueno conocer una especie de estado de pérdidas y
   * ganancias... que el sistema calcule punto de equilibrio, si estamos en
   * superávit, déficit, pronostique cuánto debería ser el crecimiento
   * mensual". Todo en soles (PEN) — el negocio recurrente real es
   * nacional; USD queda fuera de este cálculo (ver /admin/finanzas para el
   * balance por moneda).
   *
   * Simplificación explícita: los gastos MONTHLY/ANNUAL se toman como una
   * "carga fija mensual actual" (snapshot de hoy) y se aplica por igual a
   * cada mes de la ventana — no se reconstruye qué gastos recurrentes
   * existían en cada mes histórico (no hay ese dato). Se documenta en la
   * respuesta (`monthlyFixedCosts`) para que quede claro qué se está
   * asumiendo.
   */
  async getProfitAndLoss(params: { months?: number } = {}) {
    const months = Math.min(24, Math.max(3, params.months ?? 6));
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);

    const [revenueByMonth, expenses, sunat, platformSettings] = await Promise.all([
      this.prisma.$queryRaw<Array<{ month: Date; total: string }>>`
        SELECT date_trunc('month', "createdAt") as month, COALESCE(SUM(total), 0) as total
        FROM "Order"
        WHERE status = 'PAID' AND currency = 'PEN' AND "createdAt" >= ${start}
        GROUP BY month ORDER BY month ASC
      `,
      this.prisma.platformExpense.findMany({ where: { currency: "PEN" } }),
      this.prisma.sunatSettings.findUnique({ where: { id: "default" } }),
      this.prisma.platformSettings.findUnique({ where: { id: "default" } }),
    ]);

    const isGravado = (sunat?.taxAffectation ?? "EXONERADO") === "GRAVADO";
    const igvPercent = sunat?.igvPercent ?? 18;
    const culqiFeePercent = platformSettings?.culqiFeePercent ?? 3.99;

    const monthlyFixedCosts = expenses
      .filter((e) => e.recurrence !== "ONCE")
      .reduce((sum, e) => sum + Number(e.amount) / (e.recurrence === "ANNUAL" ? 12 : 1), 0);

    const onceByMonth = new Map<string, number>();
    for (const e of expenses) {
      if (e.recurrence !== "ONCE") continue;
      const key = e.incurredAt.toISOString().slice(0, 7);
      onceByMonth.set(key, (onceByMonth.get(key) ?? 0) + Number(e.amount));
    }
    const revenueMap = new Map(revenueByMonth.map((r) => [r.month.toISOString().slice(0, 7), Number(r.total)]));

    // % de cada sol de ingreso que se va en costos variables (comisión de
    // pasarela + IGV, cuando aplica) — misma matemática que
    // getFinancialSummary, expresada como tasa sobre el ingreso.
    const variableRate = culqiFeePercent / 100 + (isGravado ? igvPercent / (100 + igvPercent) : 0);

    const monthRows = Array.from({ length: months }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const key = d.toISOString().slice(0, 7);
      const income = revenueMap.get(key) ?? 0;
      const variableCosts = income * variableRate;
      const fixedCosts = monthlyFixedCosts + (onceByMonth.get(key) ?? 0);
      const expensesTotal = variableCosts + fixedCosts;
      return { month: key, income, expenses: expensesTotal, profit: income - expensesTotal };
    });

    const breakEvenIncome = variableRate < 1 ? monthlyFixedCosts / (1 - variableRate) : null;

    // Pronóstico simple: promedio del crecimiento mes a mes entre los
    // meses de la ventana que sí tuvieron ingresos — no es una proyección
    // estadística sofisticada, es una tendencia simple para orientar. Se
    // exige al menos la mitad de los meses de la ventana con ingresos (no
    // solo 2, aunque sean meses sueltos y lejanos) y se recorta cada tasa
    // individual a ±300% — con pocos datos, un solo mes que pasó de casi
    // nada a algo real dispara un "crecimiento" de miles de por ciento que
    // no significa nada útil para decidir.
    const withIncome = monthRows.filter((r) => r.income > 0);
    let avgGrowthPct: number | null = null;
    if (withIncome.length >= Math.max(2, Math.ceil(months / 2))) {
      const growthRates: number[] = [];
      for (let i = 1; i < withIncome.length; i++) {
        const prev = withIncome[i - 1].income;
        if (prev > 0) growthRates.push(Math.max(-90, Math.min(300, ((withIncome[i].income - prev) / prev) * 100)));
      }
      if (growthRates.length > 0) avgGrowthPct = growthRates.reduce((a, b) => a + b, 0) / growthRates.length;
    }
    const lastIncome = monthRows[monthRows.length - 1]?.income ?? 0;
    const forecastNextMonth = avgGrowthPct !== null ? lastIncome * (1 + avgGrowthPct / 100) : null;

    const currentProfit = monthRows[monthRows.length - 1]?.profit ?? 0;
    const status: "SUPERAVIT" | "DEFICIT" | "EQUILIBRIO" = currentProfit > 1 ? "SUPERAVIT" : currentProfit < -1 ? "DEFICIT" : "EQUILIBRIO";

    return {
      months: monthRows,
      monthlyFixedCosts,
      variableRatePercent: variableRate * 100,
      breakEvenIncome,
      avgGrowthPct,
      forecastNextMonth,
      status,
    };
  }

  // --- Matrículas (buscar una puntual + ampliar plazo de acceso como caso
  // especial — "el administrador como caso especial podría ampliar el
  // plazo" tras un curso grabado con fecha de término vencida) ---

  async listEnrollments(q?: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: q
        ? {
            OR: [
              { user: { email: { contains: q, mode: "insensitive" } } },
              { user: { firstName: { contains: q, mode: "insensitive" } } },
              { user: { lastName: { contains: q, mode: "insensitive" } } },
            ],
          }
        : undefined,
      include: { user: true, course: true, program: true },
      orderBy: { enrolledAt: "desc" },
      take: 50,
    });
    return enrollments.map((e) => ({
      id: e.id,
      userName: `${e.user.firstName} ${e.user.lastName}`,
      userEmail: e.user.email,
      offeringTitle: (e.course?.title ?? e.program?.title ?? {}) as Record<string, string>,
      status: e.status,
      progressPct: e.progressPct,
      accessExpiresAt: e.accessExpiresAt?.toISOString() ?? null,
      enrolledAt: e.enrolledAt.toISOString(),
    }));
  }

  /**
   * Caso especial: el admin amplía el plazo de acceso de UNA matrícula
   * puntual (no confundir con CompaniesService.renewSeatPool, que renueva
   * el cupo B2B completo). Si la matrícula había quedado EXPIRED, vuelve a
   * ACTIVE — de lo contrario el alumno seguiría bloqueado pese a la nueva
   * fecha.
   */
  async extendEnrollmentAccess(id: string, newAccessExpiresAt: Date | null) {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id } });
    if (!enrollment) throw new NotFoundException("Matrícula no encontrada");
    return this.prisma.enrollment.update({
      where: { id },
      data: {
        accessExpiresAt: newAccessExpiresAt,
        status: enrollment.status === "EXPIRED" ? "ACTIVE" : enrollment.status,
      },
    });
  }

  // ==========================================================================
  // Usuarios y roles — antes no existía NINGÚN endpoint para listar cuentas,
  // cambiar el rol de alguien, o desactivar un acceso. La única forma de
  // crear una cuenta era el registro público (siempre STUDENT) o
  // prisma/seed.ts a mano.
  // ==========================================================================

  async listUsers(params: { q?: string; role?: string }) {
    const users = await this.prisma.user.findMany({
      where: {
        ...(params.role ? { globalRole: params.role as never } : {}),
        ...(params.q
          ? {
              OR: [
                { email: { contains: params.q, mode: "insensitive" as const } },
                { firstName: { contains: params.q, mode: "insensitive" as const } },
                { lastName: { contains: params.q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      // Antes no se veía a qué empresa pertenece cada cuenta desde
      // /admin/usuarios — había que entrar empresa por empresa a buscarlo.
      include: { companyMemberships: { where: { status: { not: "REMOVED" } }, include: { company: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      displayName: u.displayName,
      globalRole: u.globalRole,
      status: u.status,
      createdAt: u.createdAt.toISOString(),
      // Firma para certificados (solo tiene sentido para TEACHER, pero se
      // devuelve para cualquier fila — la UI solo la ofrece para docentes).
      signatureAssetId: u.signatureAssetId,
      signatureUrl: u.signatureAssetId ? this.storageService.getPublicUrl(u.signatureAssetId) : null,
      companies: u.companyMemberships.map((m) => ({ companyId: m.companyId, companyName: m.company.legalName, role: m.role })),
    }));
  }

  /**
   * Crea una cuenta directamente (sin pasar por el registro público) —
   * pensado para dar de alta docentes/soporte/otros admins. Genera una
   * contraseña temporal aleatoria y la devuelve UNA sola vez en la
   * respuesta (nunca se vuelve a poder leer) para que el admin se la pase
   * a la persona; el usuario puede cambiarla luego con "¿Olvidaste tu
   * contraseña?" si lo prefiere.
   */
  async createUser(input: { email: string; firstName: string; lastName: string; globalRole: string; password?: string }) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new BadRequestException("Ya existe una cuenta con ese correo");

    // Si el admin no eligió una contraseña, se genera una temporal (como
    // antes); si sí puso una, ya viene validada por createUserSchema
    // (mín. 8, letra + número + carácter especial) y no hace falta
    // devolverla — el admin ya la sabe porque la escribió él mismo.
    const tempPassword = input.password ? null : randomUUID().slice(0, 12);
    const passwordHash = await argon2.hash(input.password ?? tempPassword!);
    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        globalRole: input.globalRole as never,
        passwordHash,
        emailVerifiedAt: new Date(), // creada directamente por un admin — se confía en el correo
      },
    });
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      globalRole: user.globalRole,
      status: user.status,
      tempPassword,
    };
  }

  /**
   * Cambia el rol global y/o el estado (activa/desactiva el acceso) de una
   * cuenta. `status: "disabled"` ya lo respeta AuthService.login (rechaza
   * con "Cuenta deshabilitada") — antes nada escribía ese campo, así que
   * la desactivación de cuentas no era posible aunque el login ya la
   * soportara. No se permite que un admin se desactive o se quite el rol
   * ADMIN a sí mismo (evita quedar sin ningún admin con acceso).
   */
  async updateUser(id: string, actorId: string, input: { globalRole?: string; status?: string; signatureAssetId?: string | null }) {
    if (id === actorId && (input.status === "disabled" || (input.globalRole && input.globalRole !== "ADMIN"))) {
      throw new BadRequestException("No puedes desactivar tu propia cuenta ni quitarte el rol de administrador");
    }
    return this.prisma.user.update({ where: { id }, data: input as never });
  }

  /**
   * El admin resetea la contraseña de un usuario que se lo pidió (p.ej. por
   * soporte, sin pasar por el flujo de "olvidé mi contraseña" por correo).
   * Si no manda una contraseña específica, genera una temporal — mismo
   * patrón que createUser — para pasársela al usuario por otro medio.
   */
  async resetUserPassword(id: string, password?: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("Usuario no encontrado");

    const tempPassword = password ? null : randomUUID().slice(0, 12);
    const passwordHash = await argon2.hash(password ?? tempPassword!);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    return { id, email: user.email, tempPassword };
  }

  /**
   * Elimina una cuenta de verdad (no solo desactivarla). Se niega si tiene
   * órdenes, certificados o matrículas — son registros financieros/legales
   * (boletas SUNAT, certificados verificables) que no deben desaparecer
   * solo porque se borra la cuenta; en ese caso hay que desactivarla en vez
   * de eliminarla. Sirve sobre todo para cuentas de prueba/duplicadas/spam
   * que nunca llegaron a comprar ni matricularse.
   */
  async deleteUser(id: string, actorId: string) {
    if (id === actorId) throw new BadRequestException("No puedes eliminar tu propia cuenta");

    const [ordersCount, certificatesCount, enrollmentsCount] = await Promise.all([
      this.prisma.order.count({ where: { userId: id } }),
      this.prisma.certificate.count({ where: { userId: id } }),
      this.prisma.enrollment.count({ where: { userId: id } }),
    ]);
    if (ordersCount > 0 || certificatesCount > 0 || enrollmentsCount > 0) {
      throw new BadRequestException(
        "Esta cuenta tiene órdenes, certificados o matrículas — no se puede eliminar sin perder ese registro. Desactívala en su lugar.",
      );
    }

    await this.prisma.user.delete({ where: { id } });
    return { deleted: true };
  }

  // --- Docentes asignados a un curso (CourseStaff) ---

  async listCourseStaff(courseId: string) {
    const rows = await this.prisma.courseStaff.findMany({ where: { courseId }, include: { user: true } });
    return rows.map((s) => ({
      id: s.id,
      role: s.role,
      userId: s.userId,
      userEmail: s.user.email,
      userName: `${s.user.firstName} ${s.user.lastName}`,
    }));
  }

  /** Busca por correo en vez de pedir el id — el admin no tiene por qué saber el uuid de memoria. */
  async assignCourseStaff(courseId: string, input: { email: string; role: string }) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) throw new NotFoundException("No existe un usuario con ese correo");
    return this.prisma.courseStaff.upsert({
      where: { courseId_userId_role: { courseId, userId: user.id, role: input.role as never } },
      create: { courseId, userId: user.id, role: input.role as never },
      update: {},
    });
  }

  async removeCourseStaff(id: string) {
    await this.prisma.courseStaff.delete({ where: { id } });
    return { deleted: true };
  }
}

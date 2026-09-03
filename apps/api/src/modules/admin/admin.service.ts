import { randomUUID } from "node:crypto";
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import * as argon2 from "argon2";
import type { PrismaClient } from "@inkademy/db";
import type { AdminExceptionDTO, ScormLocale } from "@inkademy/shared";
import { PRISMA } from "../../common/prisma/prisma.module";
import { decimalToString } from "../../common/utils/money";
import { QUEUE_NAMES, SUBTITLES_JOBS, BACKUP_JOBS } from "../../common/queues/queue.constants";
import { logAudit } from "./audit-log.util";
import { StorageService } from "../../storage/storage.service";
import { NotificationService } from "../notification/notification.service";
import { buildFinancialReportPdf } from "./finance-report.pdf";
import { callGeminiOnce } from "../../common/ai/gemini-text.util";

@Injectable()
export class AdminService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly storageService: StorageService,
    private readonly notificationService: NotificationService,
    @InjectQueue(QUEUE_NAMES.SUBTITLES) private readonly subtitlesQueue: Queue,
    @InjectQueue(QUEUE_NAMES.BACKUP) private readonly backupQueue: Queue,
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

    // 3) COURSE_WITHOUT_TEACHER — curso publicado sin ningún CourseStaff
    // role=TEACHER. "Los cursos remotos/asincrónicos no necesitan un
    // docente asignado a menos que cobre alguna regalía" — un curso LIVE/
    // HYBRID sí necesita a alguien dictando las clases, así que ese caso
    // siempre avisa; uno RECORDED solo avisa si además tiene una
    // CourseRoyalty configurada (alguien cobra por él, así que conviene
    // tener a esa persona registrada como CourseStaff).
    const publishedCourses = await this.prisma.course.findMany({
      where: { status: "PUBLISHED" },
      include: { staff: true, royalties: { select: { id: true } } },
    });
    for (const course of publishedCourses) {
      const teacherRequired = course.modality !== "RECORDED" || course.royalties.length > 0;
      if (teacherRequired && !course.staff.some((s) => s.role === "TEACHER")) {
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

    // 6) FAILED_NOTIFICATION — un correo (bienvenida, certificado listo,
    // recordatorio, etc.) que agotó sus 3 reintentos y quedó definitivamente
    // sin entregarse. El reintento y el estado (Notification.status) ya
    // existían desde antes, pero ninguna pantalla del admin los mostraba —
    // un envío fallido quedaba invisible para siempre, sin que nadie se
    // enterara de que el alumno nunca recibió el aviso.
    const failedNotifications = await this.prisma.notification.findMany({
      where: { status: "FAILED" },
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    for (const n of failedNotifications) {
      exceptions.push({
        id: `FAILED_NOTIFICATION:${n.id}`,
        type: "FAILED_NOTIFICATION",
        severity: "MEDIUM",
        message: `No se pudo entregar el correo "${n.template}" a ${n.user.email}`,
        entityId: n.id,
        createdAt: n.createdAt.toISOString(),
      });
    }

    // 7) LIVE_SESSION_STUCK — clase que terminó hace más de 48h y sigue
    // como "programada". El sweep del worker (sweepEndedLiveSessionsForRecording,
    // cada 15 min) ya reintenta sincronizar asistencia/grabación y marcar
    // COMPLETED, pero deliberadamente deja de intentarlo pasadas 48h (para
    // no reintentar para siempre una reunión que nunca se creó bien en
    // Zoom/Teams, o una clase cancelada a último momento sin avisar acá) —
    // ese caso residual antes quedaba trabado en silencio para siempre.
    const stuckSessions = await this.prisma.liveSession.findMany({
      where: { status: "SCHEDULED", endsAt: { lt: new Date(now.getTime() - 48 * 60 * 60 * 1000) } },
      include: { course: true },
    });
    for (const session of stuckSessions) {
      exceptions.push({
        id: `LIVE_SESSION_STUCK:${session.id}`,
        type: "LIVE_SESSION_STUCK",
        severity: "MEDIUM",
        message: `La clase "${(session.course.title as Record<string, string>).es}" del ${session.startsAt.toLocaleString("es-PE")} terminó hace más de 48h y sigue como "programada" — revisa si la reunión se creó bien en Zoom/Teams`,
        entityId: session.id,
        createdAt: session.endsAt.toISOString(),
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

  /**
   * "El docente también tiene que tener una agenda interactiva para saber
   * cuándo tiene que dictar y a qué hora" — a diferencia del widget del
   * dashboard (getTeacherDashboard, acotado a las próximas 10), esto trae
   * TODAS las sesiones (pasadas y futuras) de sus cursos asignados, en el
   * mismo shape que CalendarView (ver /campus/agenda) para reusar ese
   * mismo componente de calendario mensual/lista.
   */
  async getTeacherAgenda(teacherUserId: string) {
    const sessions = await this.prisma.liveSession.findMany({
      where: { course: { staff: { some: { userId: teacherUserId } } } },
      include: { course: true },
      orderBy: { startsAt: "asc" },
    });
    return sessions.map((s) => ({
      id: s.id,
      type: "LIVE_CLASS" as const,
      title: `Clase en vivo: ${(s.course.title as Record<string, string>)?.es ?? "Curso"}`,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      liveSessionId: s.id,
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

  /**
   * Tarifa específica de curso si existe, si no la global (courseId=null)
   * del docente. La búsqueda por curso específico sí puede usar el
   * selector compuesto (courseId ahí nunca es null); la global NO —
   * mismo bug real de Prisma+null documentado en upsertTeacherRate, así
   * que esta usa `findFirst` en vez de `findUnique` con selector compuesto.
   */
  private async findTeacherRate(teacherId: string, courseId: string) {
    return (
      (await this.prisma.teacherRate.findUnique({ where: { teacherId_courseId: { teacherId, courseId } } })) ??
      (await this.prisma.teacherRate.findFirst({ where: { teacherId, courseId: null } }))
    );
  }

  /** Verifica que un TEACHER sea CourseStaff del curso antes de dejarlo ver/editar — ADMIN/SUPPORT (teacherUserId undefined) no tiene esta restricción. */
  private async assertTeacherOwnsCourse(courseId: string, teacherUserId: string) {
    const membership = await this.prisma.courseStaff.findFirst({ where: { courseId, userId: teacherUserId } });
    if (!membership) throw new ForbiddenException("No tienes asignado este curso");
  }

  /**
   * "¿Puede el docente matricularse en su propio curso y contar dos veces?"
   * — nada le impide matricularse (y calificarlo, ver CatalogService), así
   * que su matrícula/certificado/calificación no debe alimentar métricas
   * que generan un pago real (regalías, convenios institucionales) ni la
   * calificación pública que ven futuros alumnos — no es un alumno
   * independiente. Se usa como filtro `NOT IN`, nunca como bloqueo: sigue
   * pudiendo matricularse para revisar su propio curso como cualquier QA.
   */
  private async getCourseStaffUserIds(courseId: string): Promise<string[]> {
    const staff = await this.prisma.courseStaff.findMany({ where: { courseId }, select: { userId: true } });
    return staff.map((s) => s.userId);
  }

  /**
   * "Por defecto el docente que tiene un curso asignado puede editar el
   * contenido; el administrador podría también bloquearle esos accesos" —
   * a diferencia de assertTeacherOwnsCourse (solo pertenencia, usado para
   * poder VER el curso), esto además exige canEdit=true. Se usa en todas
   * las escrituras de contenido (curso/módulos/lecciones/materiales), no
   * en getCourseDetail — un docente con edición bloqueada sigue pudiendo
   * ver su curso, solo no modificarlo.
   */
  private async assertTeacherCanEditCourse(courseId: string, teacherUserId: string) {
    const membership = await this.prisma.courseStaff.findFirst({ where: { courseId, userId: teacherUserId } });
    if (!membership) throw new ForbiddenException("No tienes asignado este curso");
    if (!membership.canEdit) throw new ForbiddenException("El administrador restringió tu acceso de edición a este curso");
  }

  /**
   * Antes createModule/updateModule/deleteModule/createLesson/updateLesson/
   * deleteLesson/createMaterial/updateMaterial/deleteMaterial no recibían
   * `teacherUserId` en absoluto — un TEACHER podía editar/borrar el
   * contenido de un curso ajeno con solo conocer el id del módulo/lección/
   * material (hallazgo de auditoría de seguridad, mismo patrón que
   * updateCourse/getCourseDetail ya corregían a nivel de curso pero no
   * bajaba al contenido). Estos helpers resuelven el courseId real subiendo
   * la cadena module→course / lesson→module→course / material→(lesson o
   * module)→course y reusan assertTeacherOwnsCourse.
   */
  private async assertTeacherOwnsModule(moduleId: string, teacherUserId: string) {
    const mod = await this.prisma.courseModule.findUnique({ where: { id: moduleId }, select: { courseId: true } });
    if (!mod) throw new NotFoundException("Módulo no encontrado");
    await this.assertTeacherCanEditCourse(mod.courseId, teacherUserId);
    return mod;
  }

  private async assertTeacherOwnsLesson(lessonId: string, teacherUserId: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, include: { module: true } });
    if (!lesson) throw new NotFoundException("Lección no encontrada");
    await this.assertTeacherCanEditCourse(lesson.module.courseId, teacherUserId);
    return lesson;
  }

  private async assertTeacherOwnsMaterial(materialId: string, teacherUserId: string) {
    const material = await this.prisma.material.findUnique({
      where: { id: materialId },
      include: { lesson: { include: { module: true } }, module: true },
    });
    if (!material) throw new NotFoundException("Material no encontrado");
    const courseId = material.lesson?.module.courseId ?? material.module?.courseId;
    if (!courseId) throw new NotFoundException("Material sin curso asociado");
    await this.assertTeacherCanEditCourse(courseId, teacherUserId);
    return material;
  }

  createCourse(input: Record<string, unknown>) {
    return this.prisma.course.create({ data: input as never });
  }

  async updateCourse(id: string, input: Record<string, unknown>, teacherUserId?: string) {
    if (teacherUserId) await this.assertTeacherCanEditCourse(id, teacherUserId);
    return this.prisma.course.update({ where: { id }, data: input as never });
  }

  /**
   * "El docente al final debería poder visualizar/descargar la lista de
   * los inscritos y su reporte de asistencia" — por sesión (durationMin
   * real) y si esa sesión cuenta como "presente" según
   * ApprovalRule.minConnectionMinutes (o cualquier conexión, si no está
   * configurado). Lectura, no escritura — usa assertTeacherOwnsCourse
   * (membresía), no assertTeacherCanEditCourse: un docente con edición
   * bloqueada igual necesita ver quién asistió.
   */
  async getAttendanceReport(courseId: string, teacherUserId?: string) {
    if (teacherUserId) await this.assertTeacherOwnsCourse(courseId, teacherUserId);

    const [sessions, enrollments, rule] = await Promise.all([
      this.prisma.liveSession.findMany({ where: { courseId }, orderBy: { startsAt: "asc" } }),
      this.prisma.enrollment.findMany({
        where: { courseId, offeringKind: "COURSE", status: { in: ["ACTIVE", "COMPLETED"] } },
        include: { user: true },
        orderBy: { enrolledAt: "asc" },
      }),
      this.prisma.approvalRule.findUnique({ where: { courseId } }),
    ]);
    const minConnectionMinutes = rule?.minConnectionMinutes ?? null;

    const attendance = await this.prisma.attendance.findMany({
      where: { liveSessionId: { in: sessions.map((s) => s.id) } },
    });
    const byKey = new Map(attendance.map((a) => [`${a.liveSessionId}:${a.userId}`, a]));

    const rows = enrollments.map((e) => {
      const bySession: Record<string, { durationMin: number | null; present: boolean }> = {};
      let attendedCount = 0;
      for (const s of sessions) {
        const a = byKey.get(`${s.id}:${e.userId}`);
        const present = a ? (minConnectionMinutes !== null ? (a.durationMin ?? 0) >= minConnectionMinutes : a.joinedAt !== null) : false;
        if (present) attendedCount += 1;
        bySession[s.id] = { durationMin: a?.durationMin ?? null, present };
      }
      return {
        userId: e.userId,
        userName: e.user.displayName ?? `${e.user.firstName} ${e.user.lastName}`,
        userEmail: e.user.email,
        bySession,
        attendedCount,
        totalSessions: sessions.length,
        attendancePct: sessions.length > 0 ? Math.round((attendedCount / sessions.length) * 10000) / 100 : null,
      };
    });

    return {
      minConnectionMinutes,
      sessions: sessions.map((s) => ({ id: s.id, startsAt: s.startsAt.toISOString(), title: s.title })),
      rows,
    };
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
            lessons: { orderBy: { order: "asc" }, include: { materials: { orderBy: { order: "asc" } } } },
            materials: { orderBy: { order: "asc" } },
          },
        },
        liveSessions: { orderBy: { startsAt: "asc" } },
      },
    });
    if (!course) throw new NotFoundException("Curso no encontrado");
    // Un material kind="link" no tiene assetId (no se subió ningún archivo)
    // — su "URL para abrir" es externalUrl tal cual, no algo resuelto contra
    // el storage (que trataría esa URL externa como si fuera una key S3 y
    // armaría un enlace roto). Ver Material.externalUrl.
    const withAssetUrl = <T extends { assetId: string | null; externalUrl?: string | null; kind?: string }>(m: T) => ({
      ...m,
      assetUrl: m.kind === "link" ? m.externalUrl ?? null : m.assetId ? this.storageService.getPublicUrl(m.assetId) : null,
    });
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

  async createModule(courseId: string, input: { title: object; order?: number }, teacherUserId?: string) {
    if (teacherUserId) await this.assertTeacherCanEditCourse(courseId, teacherUserId);
    return this.prisma.courseModule.create({ data: { courseId, title: input.title, order: input.order ?? 0 } });
  }

  async updateModule(id: string, input: Partial<{ title: object; order: number }>, teacherUserId?: string) {
    if (teacherUserId) await this.assertTeacherOwnsModule(id, teacherUserId);
    return this.prisma.courseModule.update({ where: { id }, data: input });
  }

  async deleteModule(id: string, teacherUserId?: string) {
    if (teacherUserId) await this.assertTeacherOwnsModule(id, teacherUserId);
    await this.prisma.courseModule.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * "Es muy complicado... no drag and drop" — antes no existía NINGUNA
   * forma de reordenar módulos (ni con flechas, a diferencia de las
   * lecciones). Mismo patrón que AssessmentService.reorderQuestions/
   * reorderAssessments.
   */
  async reorderModules(courseId: string, orderedModuleIds: string[], teacherUserId?: string) {
    if (teacherUserId) await this.assertTeacherCanEditCourse(courseId, teacherUserId);
    const existing = await this.prisma.courseModule.findMany({ where: { courseId }, select: { id: true } });
    const existingIds = new Set(existing.map((m) => m.id));
    if (orderedModuleIds.length !== existingIds.size || orderedModuleIds.some((id) => !existingIds.has(id))) {
      throw new BadRequestException("La lista de módulos no coincide con los módulos reales de este curso");
    }
    await this.prisma.$transaction(
      orderedModuleIds.map((id, index) => this.prisma.courseModule.update({ where: { id }, data: { order: index } })),
    );
    return { reordered: true };
  }

  async createLesson(
    moduleId: string,
    input: {
      title: object;
      order?: number;
      contentType: "VIDEO" | "PDF" | "LINK" | "TEXT" | "SCORM" | "AUDIO";
      videoAssetId?: string;
      audioAssetId?: string;
      durationMinutes?: number;
      isFreePreview?: boolean;
    },
    teacherUserId?: string,
  ) {
    if (teacherUserId) await this.assertTeacherOwnsModule(moduleId, teacherUserId);
    return this.prisma.lesson.create({ data: { moduleId, ...input, order: input.order ?? 0 } as never });
  }

  async updateLesson(id: string, input: Record<string, unknown>, teacherUserId?: string) {
    const lesson = teacherUserId ? await this.assertTeacherOwnsLesson(id, teacherUserId) : null;
    // "El administrador debe indicar si ese video inicia el curso" — a lo
    // más UNA lección por curso puede ser la iniciadora; marcar una nueva
    // automáticamente desmarca cualquier otra del mismo curso.
    if (input.isCourseStarter === true) {
      const target = lesson ?? (await this.prisma.lesson.findUnique({ where: { id }, include: { module: true } }));
      if (target) {
        await this.prisma.lesson.updateMany({
          where: { module: { courseId: target.module.courseId }, id: { not: id } },
          data: { isCourseStarter: false },
        });
      }
    }
    return this.prisma.lesson.update({ where: { id }, data: input as never });
  }

  /**
   * "Subtítulos/transcripción" (Fase 2) — usa Gemini (ya integrado para el
   * asistente de IA, sin credenciales nuevas) para transcribir el audio
   * real del video y devolver un WebVTT con marcas de tiempo. Encola el job
   * (subir un video + esperar a que Gemini lo procese puede tomar más de
   * lo razonable para una request HTTP síncrona) — apps/worker hace el
   * trabajo real, ver processors/subtitles.processor.ts.
   */
  async generateLessonSubtitles(id: string, teacherUserId?: string) {
    const lesson = teacherUserId ? await this.assertTeacherOwnsLesson(id, teacherUserId) : await this.prisma.lesson.findUnique({ where: { id } });
    if (!lesson) throw new NotFoundException("Lección no encontrada");
    if (!lesson.videoAssetId) throw new BadRequestException("Esta lección todavía no tiene un video cargado");
    if (lesson.subtitlesStatus === "PROCESSING") throw new BadRequestException("Ya se está generando un subtítulo para esta lección");

    await this.prisma.lesson.update({ where: { id }, data: { subtitlesStatus: "PROCESSING", subtitlesError: null } });
    await this.subtitlesQueue.add(SUBTITLES_JOBS.GENERATE, { lessonId: id }, { attempts: 2, removeOnComplete: true, removeOnFail: 50 });
    return { queued: true };
  }

  async deleteLesson(id: string, teacherUserId?: string) {
    if (teacherUserId) await this.assertTeacherOwnsLesson(id, teacherUserId);
    await this.prisma.lesson.delete({ where: { id } });
    return { deleted: true };
  }

  async createMaterial(
    lessonId: string,
    input: {
      title: string;
      assetId?: string;
      externalUrl?: string;
      kind: string;
      category?: string;
      visible?: boolean;
      allowDownload?: boolean;
      allowView?: boolean;
    },
    teacherUserId?: string,
  ) {
    if (teacherUserId) await this.assertTeacherOwnsLesson(lessonId, teacherUserId);
    const order = await this.prisma.material.count({ where: { lessonId } });
    return this.prisma.material.create({ data: { lessonId, order, ...input } as never });
  }

  /** Lectura/documento a nivel de módulo entero (no de una lección puntual) — ver Material.moduleId. */
  async createModuleMaterial(
    moduleId: string,
    input: {
      title: string;
      assetId?: string;
      externalUrl?: string;
      kind: string;
      category?: string;
      visible?: boolean;
      allowDownload?: boolean;
      allowView?: boolean;
    },
    teacherUserId?: string,
  ) {
    if (teacherUserId) await this.assertTeacherOwnsModule(moduleId, teacherUserId);
    const order = await this.prisma.material.count({ where: { moduleId } });
    return this.prisma.material.create({ data: { moduleId, order, ...input } as never });
  }

  async updateMaterial(id: string, input: Record<string, unknown>, teacherUserId?: string) {
    if (teacherUserId) await this.assertTeacherOwnsMaterial(id, teacherUserId);
    return this.prisma.material.update({ where: { id }, data: input as never });
  }

  /**
   * "¿Cómo sabe el sistema cuál va primero?" — intercambia el `order` de
   * dos materiales HERMANOS (misma lección o mismo módulo) para moverlos
   * arriba/abajo, en vez de reasignar toda la lista (más simple y sin
   * riesgo de dejar huecos/duplicados si dos admins editan a la vez).
   */
  async reorderMaterial(id: string, direction: "up" | "down", teacherUserId?: string) {
    if (teacherUserId) await this.assertTeacherOwnsMaterial(id, teacherUserId);
    const material = await this.prisma.material.findUnique({ where: { id } });
    if (!material) throw new NotFoundException("Material no encontrado");
    const siblings = await this.prisma.material.findMany({
      where: material.lessonId ? { lessonId: material.lessonId } : { moduleId: material.moduleId },
      orderBy: { order: "asc" },
    });
    const idx = siblings.findIndex((s) => s.id === id);
    const swapWithIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapWithIdx < 0 || swapWithIdx >= siblings.length) return material; // ya está en el extremo, no hay nada que hacer
    const swapWith = siblings[swapWithIdx];
    await this.prisma.$transaction([
      this.prisma.material.update({ where: { id: material.id }, data: { order: swapWith.order } }),
      this.prisma.material.update({ where: { id: swapWith.id }, data: { order: material.order } }),
    ]);
    return { reordered: true };
  }

  async deleteMaterial(id: string, teacherUserId?: string) {
    if (teacherUserId) await this.assertTeacherOwnsMaterial(id, teacherUserId);
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

  // --- Regla de aprobación (ApprovalRule) — antes solo se podía crear
  // editando prisma/seed.ts a mano; no había ninguna pantalla de admin. ---

  async getApprovalRule(courseId: string) {
    return (
      (await this.prisma.approvalRule.findUnique({ where: { courseId } })) ?? {
        courseId,
        minProgressPct: 100,
        minAttendancePct: null,
        minConnectionMinutes: null,
        minScore: 70,
        requiresAssignment: false,
        scoreMode: "BEST_ATTEMPT",
      }
    );
  }

  updateApprovalRule(
    courseId: string,
    input: {
      minProgressPct?: number;
      minAttendancePct?: number | null;
      minConnectionMinutes?: number | null;
      minScore?: number;
      requiresAssignment?: boolean;
      scoreMode?: string;
    },
  ) {
    return this.prisma.approvalRule.upsert({
      where: { courseId },
      create: { courseId, ...input },
      update: input,
    });
  }

  // --- Plantillas de certificado ---

  async listCertificateTemplates() {
    const templates = await this.prisma.certificateTemplate.findMany({ orderBy: { createdAt: "desc" } });
    // Para poder reabrir una plantilla BACKGROUND en modo edición hace falta
    // la URL del archivo ya subido (no solo el key) — mismo patrón que
    // signatureUrl en listUsers.
    return Promise.all(
      templates.map(async (t) => ({
        ...t,
        backgroundPreviewUrl: t.backgroundAssetId
          ? this.storageService.getPublicUrl(t.backgroundAssetId) ?? (await this.storageService.getSignedUrl(t.backgroundAssetId))
          : null,
      })),
    );
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

  /** No se puede eliminar una plantilla ya usada para emitir certificados reales, ni una asignada a un curso/programa — se pide desasignarla primero. */
  async deleteCertificateTemplate(id: string) {
    const [certificatesCount, coursesUsing, programsUsing] = await Promise.all([
      this.prisma.certificate.count({ where: { templateId: id } }),
      this.prisma.course.count({ where: { certificateTemplateId: id } }),
      this.prisma.program.count({ where: { certificateTemplateId: id } }),
    ]);
    if (certificatesCount > 0) {
      throw new BadRequestException(`No se puede eliminar: ya se emitieron ${certificatesCount} certificado(s) con esta plantilla.`);
    }
    if (coursesUsing > 0 || programsUsing > 0) {
      throw new BadRequestException(
        `No se puede eliminar: está asignada a ${coursesUsing} curso(s) y ${programsUsing} programa(s) — desasígnala primero.`,
      );
    }
    await this.prisma.certificateTemplate.delete({ where: { id } });
    return { deleted: true };
  }

  // --- Convenios institucionales (certificado con 3ra firma + facturación por convenio) ---

  async listPartnerInstitutions() {
    const rows = await this.prisma.partnerInstitution.findMany({
      include: { courses: { include: { course: { select: { id: true, slug: true, title: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    // Prisma.Decimal no serializa a JSON como número plano por defecto —
    // sin esto el frontend mostraba "S/ NaN" (mismo caso que Order/Course).
    return rows.map((r) => ({
      ...r,
      feeAmount: r.feeAmount ? decimalToString(r.feeAmount) : null,
      signatureUrl: r.signatureAssetId ? this.storageService.getPublicUrl(r.signatureAssetId) : null,
    }));
  }

  createPartnerInstitution(input: {
    name: string;
    contactEmail?: string;
    signerName?: string;
    signerTitle?: string;
    signatureAssetId?: string;
    billingType?: "FIXED" | "PER_COURSE" | "PER_PERIOD" | "PER_ENROLLMENT";
    feeAmount?: number;
    feeCurrency?: string;
    invoicesDirectly?: boolean;
  }) {
    return this.prisma.partnerInstitution.create({ data: input as never });
  }

  // "Los convenios" — antes sin ninguna auditoría pese a afectar el estado
  // de resultados (getPartnerInstitutionCosts) y la firma que aparece en
  // los certificados; ver plan de backups/auditoría. Update/delete piden el
  // "antes" con un findUnique previo (antes iban directo a la mutación).
  async updatePartnerInstitution(id: string, input: Record<string, unknown>, actorId?: string) {
    const before = await this.prisma.partnerInstitution.findUnique({ where: { id } });
    const updated = await this.prisma.partnerInstitution.update({ where: { id }, data: input as never });
    await logAudit(this.prisma, { actorId, action: "PARTNER_INSTITUTION_UPDATE", entity: "PartnerInstitution", entityId: id, before: before as never, after: input });
    return updated;
  }

  async deletePartnerInstitution(id: string, actorId?: string) {
    const before = await this.prisma.partnerInstitution.findUnique({ where: { id } });
    await this.prisma.partnerInstitution.delete({ where: { id } });
    await logAudit(this.prisma, { actorId, action: "PARTNER_INSTITUTION_DELETE", entity: "PartnerInstitution", entityId: id, before: before as never });
    return { deleted: true };
  }

  async addCoursePartnership(input: { courseId: string; partnerInstitutionId: string; startDate?: string; endDate?: string }, actorId?: string) {
    const created = await this.prisma.coursePartnership.create({
      data: {
        courseId: input.courseId,
        partnerInstitutionId: input.partnerInstitutionId,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
      },
    });
    await logAudit(this.prisma, { actorId, action: "COURSE_PARTNERSHIP_ADD", entity: "CoursePartnership", entityId: created.id, after: input });
    return created;
  }

  async removeCoursePartnership(id: string, actorId?: string) {
    const before = await this.prisma.coursePartnership.findUnique({ where: { id } });
    await this.prisma.coursePartnership.delete({ where: { id } });
    await logAudit(this.prisma, { actorId, action: "COURSE_PARTNERSHIP_REMOVE", entity: "CoursePartnership", entityId: id, before: before as never });
    return { deleted: true };
  }

  /** "Los convenios se pueden renovar, extender su plazo" — actualiza el rango de fechas de un curso ya asignado a un convenio. */
  async updateCoursePartnership(id: string, input: { startDate?: string | null; endDate?: string | null }, actorId?: string) {
    const before = await this.prisma.coursePartnership.findUnique({ where: { id } });
    const updated = await this.prisma.coursePartnership.update({
      where: { id },
      data: {
        ...(input.startDate !== undefined ? { startDate: input.startDate ? new Date(input.startDate) : null } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate ? new Date(input.endDate) : null } : {}),
      },
    });
    await logAudit(this.prisma, { actorId, action: "COURSE_PARTNERSHIP_UPDATE", entity: "CoursePartnership", entityId: id, before: before as never, after: input });
    return updated;
  }

  /**
   * Costo estimado de los convenios institucionales en el periodo — se suma
   * al estado de pérdidas y ganancias como un gasto más, EN LA MONEDA DEL
   * CONVENIO (feeCurrency puede ser PEN o USD — "la entidad puede cobrar en
   * soles como en dólares"). FIXED se prorratea igual que un PlatformExpense
   * recurrente (no hay forma de saber "cuántos meses de convenio cayeron en
   * la ventana" sin más contexto, así que se trata como carga mensual
   * constante); PER_COURSE cuenta certificados emitidos en el periodo;
   * PER_ENROLLMENT cuenta alumnos matriculados en el periodo (sin exigir que
   * terminen); PER_PERIOD se cuenta completo si el rango del convenio se
   * solapa con la ventana pedida.
   */
  async getPartnerInstitutionCosts(params: { from: Date; to: Date }) {
    const partnerships = await this.prisma.coursePartnership.findMany({
      include: { partnerInstitution: true },
    });
    const byCurrency = new Map<string, number>();
    const breakdown: Array<{ partnerName: string; courseId: string; billingType: string; amount: number; currency: string }> = [];
    for (const p of partnerships) {
      if (!p.partnerInstitution.active || !p.partnerInstitution.feeAmount) continue;
      const fee = Number(p.partnerInstitution.feeAmount);
      const currency = p.partnerInstitution.feeCurrency;
      let amount = 0;
      if (p.partnerInstitution.billingType === "FIXED") {
        amount = fee; // carga mensual constante, mismo criterio que PlatformExpense MONTHLY
      } else if (p.partnerInstitution.billingType === "PER_COURSE") {
        const staffUserIds = await this.getCourseStaffUserIds(p.courseId);
        const count = await this.prisma.certificate.count({
          where: { courseId: p.courseId, issuedAt: { gte: params.from, lte: params.to }, userId: { notIn: staffUserIds } },
        });
        amount = fee * count;
      } else if (p.partnerInstitution.billingType === "PER_ENROLLMENT") {
        // Excluye CANCELLED (misma razón que en getRoyaltyCosts) y a los
        // propios CourseStaff del curso — si el docente se matricula en su
        // propio curso, esa matrícula no es un alumno real que el convenio
        // deba facturar.
        const staffUserIds = await this.getCourseStaffUserIds(p.courseId);
        const count = await this.prisma.enrollment.count({
          where: { courseId: p.courseId, enrolledAt: { gte: params.from, lte: params.to }, status: { not: "CANCELLED" }, userId: { notIn: staffUserIds } },
        });
        amount = fee * count;
      } else if (p.partnerInstitution.billingType === "PER_PERIOD") {
        const overlaps = (!p.startDate || p.startDate <= params.to) && (!p.endDate || p.endDate >= params.from);
        amount = overlaps ? fee : 0;
      }
      if (amount > 0) {
        byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + amount);
        breakdown.push({ partnerName: p.partnerInstitution.name, courseId: p.courseId, billingType: p.partnerInstitution.billingType, amount, currency });
      }
    }
    return { byCurrency, breakdown };
  }

  /**
   * Costo estimado de regalías en el periodo — mismo criterio que convenios
   * institucionales, pero para RoyaltyRecipient/CourseRoyalty. PER_REFERRAL
   * se simplifica como "% del ingreso de ESE curso en el periodo" (no hay
   * un sistema de código de referido por alumno individual todavía — se
   * documenta como limitación conocida).
   */
  async getRoyaltyCosts(params: { from: Date; to: Date }) {
    const royalties = await this.prisma.courseRoyalty.findMany({ include: { royaltyRecipient: true } });
    const byCurrency = new Map<string, number>();
    const breakdown: Array<{ recipientName: string; courseId: string; billingType: string; amount: number; currency: string }> = [];
    for (const r of royalties) {
      if (!r.royaltyRecipient.active || !r.royaltyRecipient.feePercent) continue;
      const overlaps = (!r.startDate || r.startDate <= params.to) && (!r.endDate || r.endDate >= params.from);
      if (!overlaps) continue;
      const currency = r.royaltyRecipient.feeCurrency;
      let amount = 0;
      if (r.royaltyRecipient.billingType === "PER_ENROLLMENT") {
        // Excluye CANCELLED (p.ej. una orden de prueba retrotraída en zona de
        // pruebas) y a los propios CourseStaff del curso — si el docente (o
        // un co-docente/moderador) se matricula en su propio curso, esa
        // matrícula no genera una regalía real que pagarle a nadie.
        const staffUserIds = await this.getCourseStaffUserIds(r.courseId);
        const count = await this.prisma.enrollment.count({
          where: { courseId: r.courseId, enrolledAt: { gte: params.from, lte: params.to }, status: { not: "CANCELLED" }, userId: { notIn: staffUserIds } },
        });
        amount = count; // % se aplica sobre un monto fijo por matrícula — ver feePercent como "soles por matrícula" en este caso simplificado
      } else if (r.royaltyRecipient.billingType === "PER_COMPLETION") {
        const staffUserIds = await this.getCourseStaffUserIds(r.courseId);
        const count = await this.prisma.certificate.count({
          where: { courseId: r.courseId, issuedAt: { gte: params.from, lte: params.to }, userId: { notIn: staffUserIds } },
        });
        amount = count;
      } else if (r.royaltyRecipient.billingType === "PER_REFERRAL") {
        const orders = await this.prisma.order.findMany({
          where: { status: "PAID", createdAt: { gte: params.from, lte: params.to }, currency, items: { some: { courseId: r.courseId } } },
        });
        const courseIncome = orders.reduce((sum, o) => sum + Number(o.total), 0);
        amount = courseIncome * (r.royaltyRecipient.feePercent / 100);
      }
      if (amount > 0) {
        byCurrency.set(currency, (byCurrency.get(currency) ?? 0) + amount);
        breakdown.push({ recipientName: r.royaltyRecipient.name, courseId: r.courseId, billingType: r.royaltyRecipient.billingType, amount, currency });
      }
    }
    return { byCurrency, breakdown };
  }

  /**
   * Minutos efectivamente pagables de una sesión en vivo ya dictada, según
   * asistencia real vs. horario programado, con tolerancia — "siempre hay
   * una tolerancia al inicio y final de cada clase... si se excede es su
   * problema, no nuestro". Nunca se paga más que la duración programada
   * (quedarse más tiempo no genera pago extra); tardanza/salida temprana
   * MÁS ALLÁ de la tolerancia se descuenta.
   */
  private computeSessionPayableMinutes(
    session: { startsAt: Date; endsAt: Date },
    attendance: { joinedAt: Date | null; leftAt: Date | null } | null,
    toleranceStartMinutes: number,
    toleranceEndMinutes: number,
  ): { scheduledMinutes: number; payableMinutes: number; latenessMinutes: number; earlinessMinutes: number } {
    const scheduledMinutes = (session.endsAt.getTime() - session.startsAt.getTime()) / 60_000;
    if (!attendance?.joinedAt || !attendance?.leftAt) {
      // Sin dato real de asistencia (sesión futura o Graph no sincronizado
      // todavía) — se estima con la duración completa programada.
      return { scheduledMinutes, payableMinutes: scheduledMinutes, latenessMinutes: 0, earlinessMinutes: 0 };
    }
    // "La tolerancia al inicio de clase y la tolerancia al final son
    // diferentes" — cada margen se resta contra el suyo, no un solo valor
    // compartido.
    const latenessMinutes = Math.max(0, (attendance.joinedAt.getTime() - session.startsAt.getTime()) / 60_000 - toleranceStartMinutes);
    const earlinessMinutes = Math.max(0, (session.endsAt.getTime() - attendance.leftAt.getTime()) / 60_000 - toleranceEndMinutes);
    const payableMinutes = Math.max(0, scheduledMinutes - latenessMinutes - earlinessMinutes);
    return { scheduledMinutes, payableMinutes, latenessMinutes, earlinessMinutes };
  }

  /**
   * Costo estimado de horas de docencia en el periodo — "si el curso es
   * grabado no tendrá pago por docencia" (no hay sesiones en vivo que
   * pagar). Solo cuenta sesiones de cursos LIVE/HYBRID con un TeacherRate
   * activo configurado para ese docente (global o específico del curso).
   */
  async getTeachingHoursCost(params: { from: Date; to: Date }) {
    const sessions = await this.prisma.liveSession.findMany({
      where: { startsAt: { gte: params.from, lte: params.to }, status: { not: "CANCELLED" }, course: { modality: { not: "RECORDED" } } },
      include: { course: true },
    });
    const byCurrency = new Map<string, number>();
    let totalMinutes = 0;
    for (const session of sessions) {
      if (!session.teacherId) continue;
      const rate = await this.findTeacherRate(session.teacherId, session.courseId);
      if (!rate || !rate.active || Number(rate.hourlyRateTeaching) <= 0) continue;
      const attendance = await this.prisma.attendance.findUnique({
        where: { liveSessionId_userId: { liveSessionId: session.id, userId: session.teacherId } },
      });
      const { payableMinutes } = this.computeSessionPayableMinutes(session, attendance, rate.toleranceStartMinutes, rate.toleranceEndMinutes);
      const amount = (payableMinutes / 60) * Number(rate.hourlyRateTeaching);
      byCurrency.set(rate.currency, (byCurrency.get(rate.currency) ?? 0) + amount);
      totalMinutes += payableMinutes;
    }
    return { byCurrency, totalHours: Math.round((totalMinutes / 60) * 100) / 100 };
  }

  /**
   * "El admin debe poder ver a qué hora se conectó y desconectó el docente
   * en las clases en vivo, y el balance de horas dictadas por clase y por
   * curso" — detalle sesión por sesión (para auditar una clase puntual) más
   * un resumen agregado por docente y por curso. `attendance` viene de
   * Attendance (sincronizada desde Microsoft Graph tras la clase, o
   * ingresada a mano si Graph no llegó a sincronizar).
   */
  async listTeacherSessionHours(params: { teacherId?: string; courseId?: string; from?: Date; to?: Date }) {
    const sessions = await this.prisma.liveSession.findMany({
      where: {
        status: { not: "CANCELLED" },
        ...(params.teacherId ? { teacherId: params.teacherId } : {}),
        ...(params.courseId ? { courseId: params.courseId } : {}),
        ...(params.from || params.to
          ? { startsAt: { ...(params.from ? { gte: params.from } : {}), ...(params.to ? { lte: params.to } : {}) } }
          : {}),
      },
      include: { course: { select: { id: true, slug: true, title: true } }, teacher: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { startsAt: "desc" },
      take: 500,
    });

    const rows = [];
    for (const session of sessions) {
      if (!session.teacherId || !session.teacher) continue;
      const attendance = await this.prisma.attendance.findUnique({
        where: { liveSessionId_userId: { liveSessionId: session.id, userId: session.teacherId } },
      });
      const rate = await this.findTeacherRate(session.teacherId, session.courseId);
      const toleranceStartMinutes = rate?.toleranceStartMinutes ?? 10;
      const toleranceEndMinutes = rate?.toleranceEndMinutes ?? 10;
      const { scheduledMinutes, payableMinutes, latenessMinutes, earlinessMinutes } = this.computeSessionPayableMinutes(session, attendance, toleranceStartMinutes, toleranceEndMinutes);
      rows.push({
        sessionId: session.id,
        courseId: session.courseId,
        courseTitle: session.course.title,
        teacherId: session.teacherId,
        teacherName: `${session.teacher.firstName} ${session.teacher.lastName}`,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        joinedAt: attendance?.joinedAt ?? null,
        leftAt: attendance?.leftAt ?? null,
        hasAttendanceData: Boolean(attendance?.joinedAt && attendance?.leftAt),
        scheduledMinutes: Math.round(scheduledMinutes),
        payableMinutes: Math.round(payableMinutes),
        latenessMinutes: Math.round(latenessMinutes),
        earlinessMinutes: Math.round(earlinessMinutes),
      });
    }

    // Resumen — horas programadas vs. efectivamente pagables, por docente y por curso.
    const byTeacher = new Map<string, { teacherName: string; scheduledMinutes: number; payableMinutes: number; sessions: number }>();
    const byCourse = new Map<string, { courseTitle: unknown; scheduledMinutes: number; payableMinutes: number; sessions: number }>();
    for (const r of rows) {
      const t = byTeacher.get(r.teacherId) ?? { teacherName: r.teacherName, scheduledMinutes: 0, payableMinutes: 0, sessions: 0 };
      t.scheduledMinutes += r.scheduledMinutes;
      t.payableMinutes += r.payableMinutes;
      t.sessions += 1;
      byTeacher.set(r.teacherId, t);

      const c = byCourse.get(r.courseId) ?? { courseTitle: r.courseTitle, scheduledMinutes: 0, payableMinutes: 0, sessions: 0 };
      c.scheduledMinutes += r.scheduledMinutes;
      c.payableMinutes += r.payableMinutes;
      c.sessions += 1;
      byCourse.set(r.courseId, c);
    }

    return {
      sessions: rows,
      byTeacher: Array.from(byTeacher.entries()).map(([teacherId, v]) => ({ teacherId, ...v })),
      byCourse: Array.from(byCourse.entries()).map(([courseId, v]) => ({ courseId, ...v })),
    };
  }

  // --- Regalías: quien recibe la regalía no es un usuario de la plataforma
  // (no inicia sesión) — se administra como entidad externa, igual que
  // PartnerInstitution. "Por cada alumno matriculado / que termina / por
  // referido, tú me pagas un %." ---

  async listRoyaltyRecipients() {
    const rows = await this.prisma.royaltyRecipient.findMany({
      include: {
        courses: { include: { course: { select: { id: true, slug: true, title: true } } } },
        // "Puede ser un docente, un personal externo, inclusive un alumno"
        // — se muestra el rol de la cuenta vinculada (si hay una) para que
        // el admin vea de un vistazo de qué tipo de persona se trata.
        user: { select: { id: true, firstName: true, lastName: true, email: true, globalRole: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows;
  }

  createRoyaltyRecipient(input: {
    userId?: string | null;
    name: string;
    contactEmail?: string;
    billingType?: "PER_ENROLLMENT" | "PER_COMPLETION" | "PER_REFERRAL";
    feePercent?: number;
    feeCurrency?: string;
  }) {
    return this.prisma.royaltyRecipient.create({ data: input as never });
  }

  updateRoyaltyRecipient(id: string, input: Record<string, unknown>) {
    return this.prisma.royaltyRecipient.update({ where: { id }, data: input as never });
  }

  async deleteRoyaltyRecipient(id: string, actorId?: string) {
    // "Se borra en duro y con eso se vuelve imposible reconstruir cuánto
    // se le debía por periodos pasados (getRoyaltyCosts consulta la fila
    // viva, no un histórico)" — hallazgo de auditoría. Guardar el "antes"
    // en el log es la mitigación acotada; la corrección completa sería
    // no borrar nunca esta fila (desactivarla) — decisión de alcance
    // mayor, no algo para forzar en el mismo cambio.
    const before = await this.prisma.royaltyRecipient.findUnique({ where: { id } });
    await this.prisma.royaltyRecipient.delete({ where: { id } });
    await logAudit(this.prisma, { actorId, action: "ROYALTY_RECIPIENT_DELETE", entity: "RoyaltyRecipient", entityId: id, before: before as never });
    return { deleted: true };
  }

  // "¿Colores, tipos de letra, tamaño, como lo hacen los mejores?" — brand
  // kit reutilizable del editor SCORM (ver ScormThemePreset en el schema).
  // Catálogo global (no privado por usuario) — cualquier ADMIN/TEACHER
  // puede listar/crear; solo ADMIN puede borrar el de otro docente.
  async listScormThemePresets() {
    return this.prisma.scormThemePreset.findMany({
      include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  createScormThemePreset(input: { name: string; theme: unknown }, actorId?: string) {
    return this.prisma.scormThemePreset.create({ data: { name: input.name, theme: input.theme as never, createdById: actorId } });
  }

  async deleteScormThemePreset(id: string) {
    await this.prisma.scormThemePreset.delete({ where: { id } });
    return { deleted: true };
  }

  addCourseRoyalty(input: { courseId: string; royaltyRecipientId: string; startDate?: string; endDate?: string }) {
    return this.prisma.courseRoyalty.create({
      data: {
        courseId: input.courseId,
        royaltyRecipientId: input.royaltyRecipientId,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
      },
    });
  }

  async removeCourseRoyalty(id: string, actorId?: string) {
    const before = await this.prisma.courseRoyalty.findUnique({ where: { id } });
    await this.prisma.courseRoyalty.delete({ where: { id } });
    await logAudit(this.prisma, { actorId, action: "COURSE_ROYALTY_REMOVE", entity: "CourseRoyalty", entityId: id, before: before as never });
    return { deleted: true };
  }

  // --- Campañas de correo a clientes ---
  // "Un módulo donde enviar correos a nuestros clientes... programado
  // automático con IA, o que uno redacte y parametrice para mandar correos
  // masivos." apps/api solo administra el CRUD y calcula la audiencia; el
  // envío real (y el borrador con IA) corre en apps/worker, disparado por
  // un sweep periódico (mismo patrón que reminder.sweep) — "enviar ahora"
  // simplemente pone scheduledAt=ahora y deja que el sweep la recoja en
  // minutos, en vez de duplicar la lógica de armado+envío en dos procesos.

  /**
   * Resuelve cuántos/cuáles usuarios calzan con un filtro de audiencia —
   * usado tanto para la vista previa de "a cuántos les llega" en el admin
   * como (una versión espejo, ver apps/worker/src/processors/email-campaign.processor.ts
   * resolveAudience) por el worker al momento de enviar de verdad. SI
   * TOCAS UNO, TOCA EL OTRO — hasta hace poco esa copia solo implementaba
   * 4 de estos 9 filtros (courseIds/enrollmentStatus/countries/globalRole/
   * excludeRecentPurchaseDays se ignoraban silenciosamente al enviar de
   * verdad), ya corregido para que ambos calcen exacto.
   */
  async resolveEmailAudience(filter: {
    interests?: string[];
    areaIds?: string[];
    courseIds?: string[];
    companyId?: string;
    inactiveDays?: number;
    enrollmentStatus?: "ANY" | "HAS_ACTIVE" | "COMPLETED_NO_ACTIVE" | "NONE";
    countries?: string[];
    globalRole?: string;
    excludeRecentPurchaseDays?: number;
  } | null | undefined) {
    let enrolledUserIds: string[] | undefined;
    if (filter?.areaIds?.length || filter?.courseIds?.length) {
      const rows = await this.prisma.enrollment.findMany({
        where: {
          OR: [
            ...(filter?.areaIds?.length ? [{ course: { areaId: { in: filter.areaIds } } }] : []),
            ...(filter?.courseIds?.length ? [{ courseId: { in: filter.courseIds } }] : []),
          ],
        },
        select: { userId: true },
        distinct: ["userId"],
      });
      enrolledUserIds = rows.map((r) => r.userId);
    }

    let inactiveBeforeUserIds: string[] | undefined;
    if (filter?.inactiveDays) {
      const cutoff = new Date(Date.now() - filter.inactiveDays * 24 * 60 * 60 * 1000);
      const recentlyActive = await this.prisma.lessonProgress.findMany({
        where: { updatedAt: { gte: cutoff } },
        select: { userId: true },
        distinct: ["userId"],
      });
      const activeIds = new Set(recentlyActive.map((r) => r.userId));
      const all = await this.prisma.user.findMany({ where: { status: "active" }, select: { id: true } });
      inactiveBeforeUserIds = all.map((u) => u.id).filter((id) => !activeIds.has(id));
    }

    // "Los que están llevando un curso o más, los que ya culminaron y no
    // están llevando nada, los que aún no han llevado ninguno" — mismo
    // criterio que el semáforo de /admin/usuarios (AdminService.listUsers),
    // reutilizado acá para armar audiencias de marketing con sentido real
    // (upsell a quien ya terminó todo, primera compra a quien nunca compró).
    let enrollmentStatusUserIds: string[] | undefined;
    if (filter?.enrollmentStatus && filter.enrollmentStatus !== "ANY") {
      const rows = await this.prisma.enrollment.groupBy({ by: ["userId", "status"] });
      const byUser = new Map<string, Set<string>>();
      for (const r of rows) {
        (byUser.get(r.userId) ?? byUser.set(r.userId, new Set()).get(r.userId)!).add(r.status);
      }
      const allUsers = await this.prisma.user.findMany({ where: { status: "active" }, select: { id: true } });
      enrollmentStatusUserIds = allUsers
        .map((u) => u.id)
        .filter((id) => {
          const statuses = byUser.get(id);
          if (filter.enrollmentStatus === "NONE") return !statuses || statuses.size === 0;
          if (filter.enrollmentStatus === "HAS_ACTIVE") return Boolean(statuses?.has("ACTIVE"));
          // COMPLETED_NO_ACTIVE: tiene al menos una matrícula, terminó algo, y no lleva ninguna activa ahora.
          return Boolean(statuses && statuses.size > 0 && statuses.has("COMPLETED") && !statuses.has("ACTIVE"));
        });
    }

    let recentPurchaserIds: string[] | undefined;
    if (filter?.excludeRecentPurchaseDays) {
      const cutoff = new Date(Date.now() - filter.excludeRecentPurchaseDays * 24 * 60 * 60 * 1000);
      const rows = await this.prisma.order.findMany({
        where: { status: "PAID", createdAt: { gte: cutoff } },
        select: { userId: true },
        distinct: ["userId"],
      });
      recentPurchaserIds = rows.map((r) => r.userId);
    }

    return this.prisma.user.findMany({
      where: {
        status: "active",
        marketingConsentEmail: true,
        globalRole: (filter?.globalRole as never) ?? undefined,
        ...(enrolledUserIds ? { id: { in: enrolledUserIds } } : {}),
        ...(inactiveBeforeUserIds ? { id: { in: inactiveBeforeUserIds } } : {}),
        ...(enrollmentStatusUserIds ? { id: { in: enrollmentStatusUserIds } } : {}),
        ...(recentPurchaserIds?.length ? { id: { notIn: recentPurchaserIds } } : {}),
        ...(filter?.interests?.length ? { interests: { hasSome: filter.interests } } : {}),
        ...(filter?.countries?.length ? { country: { in: filter.countries } } : {}),
        ...(filter?.companyId ? { companyMemberships: { some: { companyId: filter.companyId } } } : {}),
      },
      select: { id: true, email: true, firstName: true, interests: true },
    });
  }

  /** Solo el conteo — para la vista previa "le llegará a N personas" sin traer toda la lista. */
  async previewEmailAudienceCount(filter: Parameters<AdminService["resolveEmailAudience"]>[0]) {
    const rows = await this.resolveEmailAudience(filter);
    return { count: rows.length };
  }

  async listEmailCampaigns() {
    return this.prisma.emailCampaign.findMany({ orderBy: { createdAt: "desc" }, include: { createdBy: { select: { firstName: true, lastName: true } } } });
  }

  async createEmailCampaign(
    input: {
      name: string;
      mode: string;
      goal?: string | null;
      subject?: string | null;
      bodyHtml?: string | null;
      audienceFilter?: unknown;
      scheduledAt?: string | null;
      recurrence: string;
    },
    createdById: string,
  ) {
    return this.prisma.emailCampaign.create({
      data: {
        name: input.name,
        mode: input.mode as never,
        goal: (input.goal ?? null) as never,
        subject: input.subject ?? null,
        bodyHtml: input.bodyHtml ?? null,
        audienceFilter: (input.audienceFilter ?? null) as never,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        recurrence: input.recurrence as never,
        status: input.scheduledAt ? "SCHEDULED" : "DRAFT",
        createdById,
      },
    });
  }

  async updateEmailCampaign(
    id: string,
    input: {
      name?: string;
      subject?: string | null;
      bodyHtml?: string | null;
      audienceFilter?: unknown;
      scheduledAt?: string | null;
      recurrence?: string;
      status?: string;
    },
  ) {
    const campaign = await this.prisma.emailCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException("Campaña no encontrada");
    if (campaign.status === "SENT") throw new BadRequestException("Ya se envió — no se puede editar, solo consultar.");

    // upsertEmailCampaignSchema exige asunto+contenido para una campaña
    // manual al CREARLA, pero updateEmailCampaignSchema (sin `mode` en el
    // payload — no se puede cambiar después de creada) no puede replicar
    // ese chequeo a nivel de schema. Se hace acá, con el `mode` real de la
    // fila existente y el valor resultante tras aplicar el patch.
    const nextSubject = input.subject !== undefined ? input.subject : campaign.subject;
    const nextBodyHtml = input.bodyHtml !== undefined ? input.bodyHtml : campaign.bodyHtml;
    if (campaign.mode === "MANUAL" && (!nextSubject?.trim() || !nextBodyHtml?.trim())) {
      throw new BadRequestException("Una campaña manual necesita asunto y contenido.");
    }

    const data: Record<string, unknown> = { ...input };
    if (input.scheduledAt !== undefined) data.scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    // Si no la cancelan explícitamente y ahora tiene fecha, pasa a SCHEDULED.
    if (input.status === undefined && input.scheduledAt) data.status = "SCHEDULED";
    return this.prisma.emailCampaign.update({ where: { id }, data: data as never });
  }

  /** "Enviar ahora" — el envío real lo hace el sweep del worker en los próximos minutos, ver email-campaign.processor.ts. */
  async sendEmailCampaignNow(id: string) {
    const campaign = await this.prisma.emailCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException("Campaña no encontrada");
    if (campaign.status === "SENT") throw new BadRequestException("Ya se envió.");
    return this.prisma.emailCampaign.update({ where: { id }, data: { status: "SCHEDULED", scheduledAt: new Date() } });
  }

  async deleteEmailCampaign(id: string) {
    const campaign = await this.prisma.emailCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException("Campaña no encontrada");
    if (campaign.status === "SENT") throw new BadRequestException("Ya se envió — se conserva como historial.");
    await this.prisma.emailCampaign.delete({ where: { id } });
    return { deleted: true };
  }

  // "También debería de poderse crear listas de correo... y poderlas
  // reutilizar, actualizar, borrar" — audiencia de marketing guardada,
  // reusa exactamente el mismo filtro de 9 campos que las campañas
  // (previewEmailAudienceCount/resolveEmailAudience de arriba sirven tal
  // cual para "a cuántos llega" esta lista, sin un endpoint aparte).
  async listMailingLists() {
    return this.prisma.mailingList.findMany({
      include: { createdBy: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  createMailingList(input: { name: string; description?: string | null; filter?: unknown }, actorId?: string) {
    return this.prisma.mailingList.create({ data: { name: input.name, description: input.description ?? null, filter: (input.filter ?? null) as never, createdById: actorId } });
  }

  updateMailingList(id: string, input: { name?: string; description?: string | null; filter?: unknown }) {
    return this.prisma.mailingList.update({ where: { id }, data: input as never });
  }

  async deleteMailingList(id: string) {
    await this.prisma.mailingList.delete({ where: { id } });
    return { deleted: true };
  }

  // --- Liquidación de docentes ---
  // Tarifas por hora (dictado / otras actividades), tolerancia, adelantos,
  // y la liquidación final por periodo — "a los docentes se les debe pagar,
  // debería haber una sección de liquidación del docente, solo si cobran".

  async listTeacherRates(teacherId?: string) {
    return this.prisma.teacherRate.findMany({
      where: teacherId ? { teacherId } : undefined,
      include: { course: { select: { id: true, slug: true, title: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Bug real encontrado en producción (no algo tocado a propósito): Prisma
   * NO acepta `null` dentro del selector compuesto `teacherId_courseId`
   * para un `upsert` — Postgres trata cada NULL como distinto de cualquier
   * otro NULL, así que un índice único que incluye una columna nullable no
   * sirve como identificador único vía ese atajo. El `as never` que había
   * acá silenciaba el error de TypeScript que hubiera avisado de esto, y
   * cada vez que un admin guardaba una tarifa GLOBAL (sin curso específico,
   * courseId=null — el caso más común) el proceso entero de la API se
   * caía con una excepción no capturada. Se resuelve buscando la fila
   * primero (findFirst, que sí acepta `null` como filtro normal) y
   * creando/actualizando por `id` en vez de por el selector compuesto.
   */
  async upsertTeacherRate(input: {
    teacherId: string;
    courseId?: string | null;
    hourlyRateTeaching?: number;
    hourlyRateOtherActivities?: number;
    currency?: string;
    toleranceStartMinutes?: number;
    toleranceEndMinutes?: number;
    paymentFrequency?: "DAILY" | "WEEKLY" | "MONTHLY" | "END_OF_COURSE";
    active?: boolean;
  }) {
    const courseId = input.courseId ?? null;
    const existing = await this.prisma.teacherRate.findFirst({ where: { teacherId: input.teacherId, courseId } });
    if (existing) {
      return this.prisma.teacherRate.update({ where: { id: existing.id }, data: input as never });
    }
    return this.prisma.teacherRate.create({ data: { ...input, courseId } as never });
  }

  async deleteTeacherRate(id: string) {
    await this.prisma.teacherRate.delete({ where: { id } });
    return { deleted: true };
  }

  listTeacherActivityLogs(teacherId: string) {
    return this.prisma.teacherActivityLog.findMany({
      where: { teacherId },
      include: { course: { select: { id: true, slug: true, title: true } } },
      orderBy: { loggedAt: "desc" },
    });
  }

  createTeacherActivityLog(input: { teacherId: string; courseId?: string; activityType?: string; hours: number; note?: string; loggedAt?: string }) {
    return this.prisma.teacherActivityLog.create({
      data: { ...input, loggedAt: input.loggedAt ? new Date(input.loggedAt) : undefined } as never,
    });
  }

  async deleteTeacherActivityLog(id: string) {
    await this.prisma.teacherActivityLog.delete({ where: { id } });
    return { deleted: true };
  }

  listTeacherAdvances(teacherId: string) {
    return this.prisma.teacherAdvance.findMany({ where: { teacherId }, orderBy: { grantedAt: "desc" } });
  }

  createTeacherAdvance(input: { teacherId: string; amount: number; currency?: string; note?: string }) {
    return this.prisma.teacherAdvance.create({ data: input as never });
  }

  async deleteTeacherAdvance(id: string) {
    const advance = await this.prisma.teacherAdvance.findUnique({ where: { id } });
    if (advance?.liquidationId) throw new BadRequestException("Este adelanto ya está aplicado a una liquidación — no se puede eliminar.");
    await this.prisma.teacherAdvance.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * "Eso se verá en su liquidación de manera proporcional y detallada
   * para que el docente sepa por qué se le está descontando" — `detail`
   * (JSON) ya traía el desglose sesión por sesión (minutos de tardanza/
   * salida temprana, tolerancia, tarifa) desde que se generó la
   * liquidación, pero solo con `sessionId` — nunca se resolvía a qué
   * clase/curso correspondía cada fila, así que ninguna pantalla podía
   * mostrarlo de forma legible. Se resuelve acá (curso + fecha de la
   * clase) para todas las liquidaciones de una sola pasada.
   */
  async listTeacherLiquidations(teacherId?: string) {
    const liquidations = await this.prisma.teacherLiquidation.findMany({
      where: teacherId ? { teacherId } : undefined,
      include: {
        // "Al momento de transferir su pago" — el admin necesita ver el
        // banco/cuenta/CCI del docente justo donde marca la liquidación
        // como pagada, sin tener que ir a buscarlo a otra pantalla.
        teacher: { select: { firstName: true, lastName: true, email: true, bankName: true, bankAccountNumber: true, bankAccountCci: true } },
        advances: true,
      },
      orderBy: { periodStart: "desc" },
    });

    // El JSON guardado por generateTeacherLiquidation es
    // { sessions: [...], hourlyRateOtherActivities } — NO un array suelto.
    const sessionsOf = (detail: unknown): Array<Record<string, unknown>> => {
      const list = (detail as { sessions?: unknown })?.sessions;
      return Array.isArray(list) ? (list as Array<Record<string, unknown>>) : [];
    };

    const sessionIds = liquidations.flatMap((l) =>
      sessionsOf(l.detail)
        .map((d) => d.sessionId)
        .filter((id): id is string => typeof id === "string"),
    );
    const sessions = sessionIds.length
      ? await this.prisma.liveSession.findMany({
          where: { id: { in: sessionIds } },
          include: { course: { select: { title: true } } },
        })
      : [];
    const sessionById = new Map(sessions.map((s) => [s.id, s]));

    return liquidations.map((l) => ({
      ...l,
      // Prisma.Decimal no serializa a JSON como número plano — sin esto el
      // frontend mostraba "S/ NaN" en Bruto/Descuento/Adelantos/Neto
      // (mismo caso que Order/Course/PartnerInstitution). Nunca se había
      // notado porque no existía ninguna liquidación con montos reales
      // hasta ahora.
      grossAmount: decimalToString(l.grossAmount),
      deductions: decimalToString(l.deductions),
      advancesDeducted: decimalToString(l.advancesDeducted),
      netAmount: decimalToString(l.netAmount),
      advances: l.advances.map((a) => ({ ...a, amount: decimalToString(a.amount) })),
      detail: {
        ...(l.detail as Record<string, unknown> | null),
        sessions: sessionsOf(l.detail).map((d) => {
          const session = typeof d.sessionId === "string" ? sessionById.get(d.sessionId) : undefined;
          return {
            ...d,
            courseTitle: (session?.course?.title as Record<string, string> | undefined) ?? null,
            sessionStartsAt: session?.startsAt.toISOString() ?? null,
          };
        }),
      },
    }));
  }

  /**
   * Genera la liquidación de un docente para un periodo: suma horas
   * dictadas (ya descontando tardanza/salida temprana más allá de la
   * tolerancia — nunca de más por quedarse tiempo extra) + horas de otras
   * actividades registradas a mano, menos adelantos todavía no aplicados.
   * Queda en DRAFT — el admin la aprueba/paga después de revisarla.
   */
  async generateTeacherLiquidation(input: { teacherId: string; periodStart: string; periodEnd: string }, actorId?: string) {
    const periodStart = new Date(input.periodStart);
    const periodEnd = new Date(input.periodEnd);

    // "Nada impide generar la misma liquidación dos veces con números
    // distintos si cambió la tarifa entre medio, sin dejar rastro de que
    // eso pasó" — hallazgo de auditoría. En vez de una restricción rígida
    // a nivel de base de datos (que bloquearía incluso una corrección
    // legítima), se avisa explícitamente si ya existe una para este
    // docente+periodo exacto, para que sea una decisión consciente y no un
    // duplicado accidental.
    //
    // El chequeo original solo comparaba fechas EXACTAMENTE iguales — generar
    // 1-15 ene y después 1-31 ene (o 10-31 ene) no lo detectaba, y las
    // sesiones del solape (1-15 ene) se pagaban dos veces sin ningún aviso.
    // Ahora se detecta cualquier RANGO que se superponga (no solo el idéntico):
    // dos periodos [a,b] y [c,d] se solapan si a<=d Y c<=b.
    const overlapping = await this.prisma.teacherLiquidation.findFirst({
      where: { teacherId: input.teacherId, periodStart: { lte: periodEnd }, periodEnd: { gte: periodStart } },
    });
    if (overlapping) {
      const exact = overlapping.periodStart.getTime() === periodStart.getTime() && overlapping.periodEnd.getTime() === periodEnd.getTime();
      throw new BadRequestException(
        exact
          ? `Ya existe una liquidación para este docente en este periodo exacto (id ${overlapping.id}, estado ${overlapping.status}). Si la tarifa cambió después de generarla, corrígela ahí en vez de crear una segunda.`
          : `Ya existe una liquidación para este docente que se superpone con este periodo (id ${overlapping.id}, del ${overlapping.periodStart.toLocaleDateString("es-PE", { timeZone: "UTC" })} al ${overlapping.periodEnd.toLocaleDateString("es-PE", { timeZone: "UTC" })}, estado ${overlapping.status}) — generar esta pagaría dos veces las sesiones del solape.`,
      );
    }

    const rates = await this.prisma.teacherRate.findMany({ where: { teacherId: input.teacherId, active: true } });
    if (rates.length === 0) {
      throw new BadRequestException("Este docente no tiene ninguna tarifa configurada — no se puede liquidar.");
    }
    const globalRate = rates.find((r) => r.courseId === null);
    const rateByCourse = new Map(rates.filter((r) => r.courseId).map((r) => [r.courseId as string, r]));

    const sessions = await this.prisma.liveSession.findMany({
      where: { teacherId: input.teacherId, startsAt: { gte: periodStart, lte: periodEnd }, status: { not: "CANCELLED" } },
    });

    let hoursTeaching = 0;
    let grossFromTeaching = 0;
    let deductionAmount = 0;
    let currency = globalRate?.currency ?? rates[0].currency;
    const detail: Array<{
      sessionId: string;
      scheduledMinutes: number;
      payableMinutes: number;
      latenessMinutes: number;
      earlinessMinutes: number;
      hourlyRateTeaching: number;
      toleranceStartMinutes: number;
      toleranceEndMinutes: number;
    }> = [];

    for (const session of sessions) {
      const rate = rateByCourse.get(session.courseId) ?? globalRate;
      if (!rate) continue;
      currency = rate.currency;
      const attendance = await this.prisma.attendance.findUnique({
        where: { liveSessionId_userId: { liveSessionId: session.id, userId: input.teacherId } },
      });
      const { scheduledMinutes, payableMinutes, latenessMinutes, earlinessMinutes } = this.computeSessionPayableMinutes(
        session,
        attendance,
        rate.toleranceStartMinutes,
        rate.toleranceEndMinutes,
      );
      hoursTeaching += payableMinutes / 60;
      grossFromTeaching += (payableMinutes / 60) * Number(rate.hourlyRateTeaching);
      deductionAmount += ((scheduledMinutes - payableMinutes) / 60) * Number(rate.hourlyRateTeaching);
      // Snapshot de la tarifa/tolerancia REALMENTE usada para este monto —
      // si alguien edita TeacherRate después, este número ya no cambia.
      detail.push({
        sessionId: session.id,
        scheduledMinutes,
        payableMinutes,
        latenessMinutes,
        earlinessMinutes,
        hourlyRateTeaching: Number(rate.hourlyRateTeaching),
        toleranceStartMinutes: rate.toleranceStartMinutes,
        toleranceEndMinutes: rate.toleranceEndMinutes,
      });
    }

    const activityLogs = await this.prisma.teacherActivityLog.findMany({
      where: { teacherId: input.teacherId, loggedAt: { gte: periodStart, lte: periodEnd } },
    });
    const hoursOtherActivities = activityLogs.reduce((sum, a) => sum + a.hours, 0);
    const otherActivitiesRate = Number(globalRate?.hourlyRateOtherActivities ?? rates[0].hourlyRateOtherActivities);
    const grossFromActivities = hoursOtherActivities * otherActivitiesRate;

    const unclaimedAdvances = await this.prisma.teacherAdvance.findMany({
      where: { teacherId: input.teacherId, liquidationId: null, grantedAt: { lte: periodEnd } },
    });
    const advancesDeducted = unclaimedAdvances.reduce((sum, a) => sum + Number(a.amount), 0);

    const grossAmount = grossFromTeaching + grossFromActivities;
    const netAmount = grossAmount - advancesDeducted;

    const liquidation = await this.prisma.teacherLiquidation.create({
      data: {
        teacherId: input.teacherId,
        periodStart,
        periodEnd,
        hoursTeaching: Math.round(hoursTeaching * 100) / 100,
        hoursOtherActivities,
        grossAmount,
        deductions: deductionAmount,
        advancesDeducted,
        netAmount,
        currency,
        createdById: actorId,
        detail: { sessions: detail, hourlyRateOtherActivities: otherActivitiesRate } as never,
      },
    });
    await logAudit(this.prisma, {
      actorId,
      action: "TEACHER_LIQUIDATION_GENERATE",
      entity: "TeacherLiquidation",
      entityId: liquidation.id,
      after: { teacherId: input.teacherId, periodStart: input.periodStart, periodEnd: input.periodEnd, grossAmount, netAmount, currency },
    });
    // Los adelantos usados quedan marcados como aplicados a ESTA liquidación
    // — no se vuelven a descontar en la próxima.
    await this.prisma.teacherAdvance.updateMany({
      where: { id: { in: unclaimedAdvances.map((a) => a.id) } },
      data: { liquidationId: liquidation.id },
    });
    return liquidation;
  }

  /** El admin puede perdonar la penalidad (p.ej. por confianza con el docente) y pagarle completo. */
  async waiveTeacherLiquidationDeduction(id: string, reason: string, actorId?: string) {
    const liquidation = await this.prisma.teacherLiquidation.findUnique({ where: { id } });
    if (!liquidation) throw new NotFoundException("Liquidación no encontrada");
    const restoredGross = Number(liquidation.grossAmount) + Number(liquidation.deductions);
    const updated = await this.prisma.teacherLiquidation.update({
      where: { id },
      data: {
        deductionsWaived: true,
        waivedReason: reason,
        waivedById: actorId,
        waivedAt: new Date(),
        grossAmount: restoredGross,
        netAmount: restoredGross - Number(liquidation.advancesDeducted),
      },
    });
    // "Se puede saber que se perdonó una deducción y por qué, pero nunca
    // quién ni cuándo" — hallazgo de auditoría. waivedById/waivedAt en la
    // misma fila ya lo resuelven; el AuditLog además guarda el monto antes/después.
    await logAudit(this.prisma, {
      actorId,
      action: "TEACHER_LIQUIDATION_WAIVE_DEDUCTION",
      entity: "TeacherLiquidation",
      entityId: id,
      before: { grossAmount: decimalToString(liquidation.grossAmount), netAmount: decimalToString(liquidation.netAmount) },
      after: { grossAmount: decimalToString(updated.grossAmount), netAmount: decimalToString(updated.netAmount), reason },
    });
    return updated;
  }

  async updateTeacherLiquidationStatus(id: string, status: "APPROVED" | "PAID", actorId?: string) {
    const before = await this.prisma.teacherLiquidation.findUnique({ where: { id }, select: { status: true } });
    const updated = await this.prisma.teacherLiquidation.update({
      where: { id },
      data: {
        status,
        ...(status === "APPROVED" ? { approvedById: actorId } : {}),
        ...(status === "PAID" ? { paidAt: new Date(), paidById: actorId } : {}),
      },
    });
    // "Aprobar/pagar una liquidación — literalmente liberar el dinero —
    // no deja registro de quién lo hizo" — hallazgo de auditoría.
    await logAudit(this.prisma, {
      actorId,
      action: `TEACHER_LIQUIDATION_${status}`,
      entity: "TeacherLiquidation",
      entityId: id,
      before: { status: before?.status },
      after: { status },
    });
    return updated;
  }

  // --- Cortesías (accesos gratuitos otorgados) ---

  /**
   * "Deberían aparecer más abajo todas las cortesías que se han realizado
   * con fecha, el administrador que dio la autorización, la empresa/
   * persona beneficiada, el curso" — GrantFreeAccessForm nunca guardó nada
   * pensado para listarse después; se reconstruye desde AuditLog
   * (action="GRANT_FREE_ACCESS", ya se registraba ahí desde
   * CommerceService.grantFreeAccess, solo que sin ninguna pantalla que lo
   * mostrara). `entity`/`entityId` es genérico (Course o Program), así que
   * se resuelven aparte en vez de con un include directo.
   */
  async listCourtesyGrants(filters: { year?: number; courseId?: string; areaSlug?: string }) {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        action: "GRANT_FREE_ACCESS",
        ...(filters.year
          ? { createdAt: { gte: new Date(`${filters.year}-01-01`), lt: new Date(`${filters.year + 1}-01-01`) } }
          : {}),
        ...(filters.courseId ? { entityId: filters.courseId } : {}),
      },
      include: { actor: true, company: true },
      orderBy: { createdAt: "desc" },
    });

    const courseIds = logs.filter((l) => l.entity === "Course" && l.entityId).map((l) => l.entityId!);
    const programIds = logs.filter((l) => l.entity === "Program" && l.entityId).map((l) => l.entityId!);
    const beneficiaryUserIds = logs
      .map((l) => (l.after as Record<string, unknown> | null)?.userId)
      .filter((id): id is string => typeof id === "string");

    const [courses, programs, beneficiaries] = await Promise.all([
      courseIds.length ? this.prisma.course.findMany({ where: { id: { in: courseIds } }, include: { area: true } }) : [],
      programIds.length ? this.prisma.program.findMany({ where: { id: { in: programIds } } }) : [],
      beneficiaryUserIds.length ? this.prisma.user.findMany({ where: { id: { in: beneficiaryUserIds } } }) : [],
    ]);
    const courseById = new Map(courses.map((c) => [c.id, c]));
    const programById = new Map(programs.map((p) => [p.id, p]));
    const userById = new Map(beneficiaries.map((u) => [u.id, u]));

    const rows = logs.map((l) => {
      const after = l.after as Record<string, unknown> | null;
      const course = l.entity === "Course" && l.entityId ? courseById.get(l.entityId) : undefined;
      const program = l.entity === "Program" && l.entityId ? programById.get(l.entityId) : undefined;
      const beneficiaryUser = typeof after?.userId === "string" ? userById.get(after.userId as string) : undefined;
      return {
        id: l.id,
        createdAt: l.createdAt.toISOString(),
        authorizedBy: l.actor ? (l.actor.displayName ?? `${l.actor.firstName} ${l.actor.lastName}`) : "Desconocido",
        offeringTitle: (course?.title ?? program?.title ?? {}) as Record<string, string>,
        areaSlug: course?.area?.slug ?? null,
        areaName: (course?.area?.name as Record<string, string> | undefined) ?? null,
        beneficiaryType: l.company ? ("COMPANY" as const) : ("USER" as const),
        beneficiaryName: l.company ? l.company.legalName : beneficiaryUser ? `${beneficiaryUser.firstName} ${beneficiaryUser.lastName}` : "—",
        seatPoolQty: typeof after?.seatPoolQty === "number" ? after.seatPoolQty : null,
        note: typeof after?.note === "string" ? after.note : null,
      };
    });

    // areaSlug no se puede filtrar en la consulta SQL (requiere resolver
    // Course primero) — se aplica acá, sobre las filas ya armadas.
    return filters.areaSlug ? rows.filter((r) => r.areaSlug === filters.areaSlug) : rows;
  }

  async deleteCourtesyGrants(ids: string[]) {
    await this.prisma.auditLog.deleteMany({ where: { id: { in: ids }, action: "GRANT_FREE_ACCESS" } });
    return { deleted: ids.length };
  }

  /**
   * "El administrador podría ver los resultados de la encuesta de
   * satisfacción como [estrellas con distribución] y un listado de
   * comentarios" — antes CourseRating (las estrellas que el alumno deja al
   * terminar un curso) se guardaba y se promediaba SOLO para mostrarse en
   * la ficha pública del curso (avgRating/reviews); no existía ninguna
   * vista agregada para el admin, a diferencia de la encuesta NPS (que sí
   * tenía su propio panel — ver NpsService.listResponses, mismo criterio
   * de distribución aplicado acá).
   */
  async listCourseRatings(filters: { courseId?: string } = {}) {
    const ratings = await this.prisma.courseRating.findMany({
      where: filters.courseId ? { courseId: filters.courseId } : {},
      include: { user: true, course: true },
      orderBy: { createdAt: "desc" },
    });
    const total = ratings.length;
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    for (const r of ratings) {
      distribution[r.stars] = (distribution[r.stars] ?? 0) + 1;
      sum += r.stars;
    }
    const courses = await this.prisma.course.findMany({
      where: { ratings: { some: {} } },
      select: { id: true, title: true },
      orderBy: { createdAt: "desc" },
    });
    return {
      totalResponses: total,
      avgStars: total > 0 ? sum / total : null,
      distribution,
      courses: courses.map((c) => ({ id: c.id, title: c.title })),
      responses: ratings.map((r) => ({
        id: r.id,
        stars: r.stars,
        comment: r.comment,
        courseId: r.courseId,
        courseTitle: r.course.title,
        studentName: r.user.displayName ?? `${r.user.firstName} ${r.user.lastName}`,
        createdAt: r.createdAt.toISOString(),
      })),
    };
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

  /**
   * `sortBy`: date (default) | company | course | status | category.
   * OrderItem.courseId no tiene relación declarada a Course (ver
   * schema.prisma) — se resuelve a mano en una segunda consulta en vez de
   * un `include` encadenado, para poder ordenar/mostrar por curso y por
   * área (categoría) del curso.
   */
  async listOrders(q?: string, sortBy?: string) {
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
      include: { user: true, electronicInvoice: true, company: true, items: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const courseIds = Array.from(new Set(orders.flatMap((o) => o.items.map((i) => i.courseId).filter((id): id is string => Boolean(id)))));
    const courses = courseIds.length
      ? await this.prisma.course.findMany({ where: { id: { in: courseIds } }, include: { area: true } })
      : [];
    const courseById = new Map(courses.map((c) => [c.id, c]));

    let rows = orders.map((o) => {
      const firstCourse = o.items.map((i) => (i.courseId ? courseById.get(i.courseId) : null)).find(Boolean);
      return {
        id: o.id,
        status: o.status,
        total: decimalToString(o.total),
        currency: o.currency,
        userEmail: o.user.email,
        buyerLegalName: o.buyerLegalName,
        companyName: o.company?.legalName ?? null,
        courseTitle: (firstCourse?.title as Record<string, string>) ?? null,
        categoryName: (firstCourse?.area?.name as Record<string, string>) ?? null,
        invoiceStatus: o.electronicInvoice?.status ?? null,
        createdAt: o.createdAt.toISOString(),
      };
    });

    switch (sortBy) {
      case "company":
        rows = rows.sort((a, b) => (a.companyName ?? "￿").localeCompare(b.companyName ?? "￿"));
        break;
      case "course":
        rows = rows.sort((a, b) => (a.courseTitle?.es ?? "￿").localeCompare(b.courseTitle?.es ?? "￿"));
        break;
      case "status":
        rows = rows.sort((a, b) => a.status.localeCompare(b.status));
        break;
      case "category":
        rows = rows.sort((a, b) => (a.categoryName?.es ?? "￿").localeCompare(b.categoryName?.es ?? "￿"));
        break;
      default:
        // ya vienen ordenadas por fecha desc desde la consulta
        break;
    }
    return rows.slice(0, 50);
  }

  /**
   * Resumen para las tarjetas de /admin/ordenes — a diferencia de listOrders
   * (recortado a 200 filas / 50 mostradas, pensado para buscar una orden
   * puntual), este corre COUNT/SUM directo sobre toda la tabla, así que el
   * total no miente aunque haya miles de órdenes.
   */
  async getOrdersSummary() {
    const [byStatus, paidPen] = await Promise.all([
      this.prisma.order.groupBy({ by: ["status"], _count: { status: true } }),
      this.prisma.order.aggregate({ where: { status: "PAID", currency: "PEN" }, _sum: { total: true } }),
    ]);
    const countByStatus = Object.fromEntries(byStatus.map((r) => [r.status, r._count.status]));
    return {
      total: byStatus.reduce((sum, r) => sum + r._count.status, 0),
      paid: countByStatus.PAID ?? 0,
      pending: countByStatus.PENDING ?? 0,
      failed: countByStatus.FAILED ?? 0,
      paidTotalPen: decimalToString(paidPen._sum.total ?? 0),
    };
  }

  // ==========================================================================
  // Finanzas — antes no existía ningún lugar para ver cuánto entra, cuánto
  // se va en IGV/comisión de pasarela, y cuánto queda de saldo real. Todo
  // se agrega a partir de datos ya existentes (Order/Payment pagados +
  // SunatSettings.taxAffectation) más PlatformExpense (gastos que el admin
  // registra a mano — hosting, marketing, etc., nada de eso lo modela el
  // sistema todavía).
  // ==========================================================================

  /**
   * Detracción SUNAT por orden, según el tipo de comprobante/documento del
   * comprador (tabla explícita pedida por el admin — no es un % único):
   * - Boleta (DNI/CE/pasaporte, buyerDocumentType="1"/"4"/"7"/"0"): nunca aplica.
   * - Factura con RUC que empieza con "10" (persona natural con negocio):
   *   aplica solo si el total de la orden supera detractionRucNaturalThreshold.
   * - Factura con RUC que empieza con "20" (empresa/persona jurídica): aplica siempre.
   * `detractionEnabled=false` es el interruptor maestro (por si la SUNAT
   * suspende la detracción por completo) — en ese caso nunca aplica nada.
   */
  private computeDetraction(
    order: { total: unknown; buyerDocumentType?: string | null; buyerDocumentNumber?: string | null },
    settings: {
      detractionEnabled: boolean;
      detractionRucNaturalPercent: number;
      detractionRucNaturalThreshold: number;
      detractionRucEmpresaPercent: number;
    },
  ): number {
    if (!settings.detractionEnabled) return 0;
    const isRuc = order.buyerDocumentType === "6" && !!order.buyerDocumentNumber;
    if (!isRuc) return 0; // boleta (persona natural, consumidor final) — nunca aplica
    const total = Number(order.total);
    if (order.buyerDocumentNumber!.startsWith("20")) {
      return total * (settings.detractionRucEmpresaPercent / 100);
    }
    if (order.buyerDocumentNumber!.startsWith("10")) {
      return total > settings.detractionRucNaturalThreshold ? total * (settings.detractionRucNaturalPercent / 100) : 0;
    }
    return 0; // RUC que no empieza con 10/20 (caso raro) — no se asume nada
  }

  /**
   * Balance financiero por moneda, con selector de periodo — "últimos 30
   * días, el último año, o todo, o hacer balances por año". `period` es un
   * atajo (last30d|lastYear|allTime|year); `year` se usa junto con
   * period="year" para un año calendario específico. from/to explícitos
   * siempre tienen prioridad si vienen (compatibilidad con el uso anterior).
   */
  async getFinancialSummary(params: { from?: string; to?: string; period?: string; year?: number } = {}) {
    const now = new Date();
    let from: Date;
    let to: Date = now;
    if (params.from || params.to) {
      from = params.from ? new Date(params.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      to = params.to ? new Date(params.to) : now;
    } else if (params.period === "lastYear") {
      from = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    } else if (params.period === "allTime") {
      from = new Date(2000, 0, 1);
    } else if (params.period === "year" && params.year) {
      from = new Date(params.year, 0, 1);
      to = new Date(params.year, 11, 31, 23, 59, 59);
    } else {
      from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // default: últimos 30 días
    }

    const [orders, paymentsByCurrencyProvider, expensesByCurrency, sunat, platformSettings, availableYears] = await Promise.all([
      this.prisma.order.findMany({
        where: { status: "PAID", createdAt: { gte: from, lte: to } },
        select: { total: true, currency: true, buyerDocumentType: true, buyerDocumentNumber: true },
      }),
      this.prisma.payment.groupBy({
        by: ["currency", "provider", "paymentMethod"],
        where: { status: "SUCCEEDED", createdAt: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
      this.prisma.platformExpense.groupBy({ by: ["currency"], where: { incurredAt: { gte: from, lte: to } }, _sum: { amount: true } }),
      this.prisma.sunatSettings.findUnique({ where: { id: "default" } }),
      this.prisma.platformSettings.findUnique({ where: { id: "default" } }),
      this.prisma.$queryRaw<Array<{ year: number }>>`SELECT DISTINCT EXTRACT(YEAR FROM "createdAt")::int as year FROM "Order" WHERE status = 'PAID' ORDER BY year DESC`,
    ]);

    const taxAffectation = (sunat?.taxAffectation as "EXONERADO" | "GRAVADO" | undefined) ?? "GRAVADO";
    const isGravado = taxAffectation === "GRAVADO";
    // 18% es la tasa vigente en Perú desde 2011, pero el Estado puede
    // cambiarla — parametrizable en vez de hardcodeada (mismo valor que usa
    // apps/worker para el XML real de boleta/factura, ver SunatSettings.igvPercent).
    const igvPercent = sunat?.igvPercent ?? 18;
    const culqiFeePercent = platformSettings?.culqiFeePercent ?? 3.99;
    const stripeFeePercent = platformSettings?.stripeFeePercent ?? 4.99;
    const yapeFeePercent = platformSettings?.yapeFeePercent ?? 0;
    const plinFeePercent = platformSettings?.plinFeePercent ?? 0;
    const detractionSettings = {
      detractionEnabled: platformSettings?.detractionEnabled ?? true,
      detractionRucNaturalPercent: platformSettings?.detractionRucNaturalPercent ?? 12,
      detractionRucNaturalThreshold: platformSettings?.detractionRucNaturalThreshold ?? 700,
      detractionRucEmpresaPercent: platformSettings?.detractionRucEmpresaPercent ?? 12,
    };
    const usdExchangeRate = platformSettings?.usdExchangeRate ?? 3.75;
    const exchangeRateSourceUrl =
      platformSettings?.exchangeRateSourceUrl ?? "https://www.sbs.gob.pe/app/pp/sistip_portal/paginas/publicacion/tipocambiopromedio.aspx";

    // "Las comisiones de Yape/Plin son separadas, no juntas" — corrección
    // explícita del admin: SÍ es un costo real de Inkapitales (el
    // comercio) — BCP cobra por recibir Yape en cuenta empresa, Interbank
    // cobra por recibir Plin en cuenta empresa, cada uno con su propia
    // tasa (ver PlatformSettings.yapeFeePercent/plinFeePercent). Cada % es
    // ADICIONAL a la comisión de la pasarela (Culqi sigue cobrando su
    // "descuento de comercio" aparte), aplicado SOLO sobre los pagos cuyo
    // `paymentMethod` (capturado del `source.type` que devuelve Culqi al
    // cobrar, ver CulqiProvider.charge) coincide con esa billetera puntual
    // — nunca sobre tarjeta, y nunca se suman ambos a la vez sobre un
    // mismo pago (un cargo es Yape O Plin O tarjeta, nunca dos). La base
    // SIEMPRE es el monto bruto efectivamente cobrado (`p._sum.amount`,
    // que YA incluye IGV) — así cobran las pasarelas en realidad, nunca
    // sobre el neto sin IGV.
    const feesByCurrency = new Map<string, number>();
    for (const p of paymentsByCurrencyProvider) {
      const walletFeePercent = p.paymentMethod === "yape" ? yapeFeePercent : p.paymentMethod === "plin" ? plinFeePercent : 0;
      const pct = p.provider === "CULQI" ? culqiFeePercent + walletFeePercent : p.provider === "STRIPE" ? stripeFeePercent : 0;
      feesByCurrency.set(p.currency, (feesByCurrency.get(p.currency) ?? 0) + Number(p._sum.amount ?? 0) * (pct / 100));
    }
    const expensesMap = new Map(expensesByCurrency.map((e) => [e.currency, Number(e._sum.amount ?? 0)]));

    const incomeByCurrency = new Map<string, number>();
    // detractionByCurrency: en la moneda propia de la orden (se resta del
    // "saldo total" de esa moneda, para que la aritmética del balance no
    // mezcle monedas). detractionPenByCurrency: el monto real que hay que
    // depositar al Banco de la Nación, siempre en soles — para una orden en
    // USD, "aunque la factura sea en dólares, se debe pagar la detracción
    // con el tipo de cambio del dólar del día": la regla (%, umbral en S/)
    // se evalúa sobre el equivalente en soles, no sobre el monto en dólares.
    const detractionByCurrency = new Map<string, number>();
    const detractionPenByCurrency = new Map<string, number>();
    for (const o of orders) {
      incomeByCurrency.set(o.currency, (incomeByCurrency.get(o.currency) ?? 0) + Number(o.total));
      if (o.currency === "PEN") {
        const d = this.computeDetraction(o, detractionSettings);
        detractionByCurrency.set(o.currency, (detractionByCurrency.get(o.currency) ?? 0) + d);
        detractionPenByCurrency.set(o.currency, (detractionPenByCurrency.get(o.currency) ?? 0) + d);
      } else {
        const totalInPen = Number(o.total) * usdExchangeRate;
        const dPen = this.computeDetraction({ ...o, total: totalInPen }, detractionSettings);
        // Se resta del balance en SU moneda de origen (convertida de vuelta)
        // para no mezclar soles dentro de un saldo en dólares.
        const dOwnCurrency = usdExchangeRate > 0 ? dPen / usdExchangeRate : 0;
        detractionByCurrency.set(o.currency, (detractionByCurrency.get(o.currency) ?? 0) + dOwnCurrency);
        detractionPenByCurrency.set(o.currency, (detractionPenByCurrency.get(o.currency) ?? 0) + dPen);
      }
    }

    // "El costo de convenios/regalías/horas de docencia debería figurar
    // automáticamente en otros gastos, dentro del balance, siempre
    // respetando la moneda en la que se encuentre" — cada uno ya viene
    // separado por currency (feeCurrency del convenio/regalía, currency de
    // la tarifa del docente), así que se suman al mapa de "otros gastos"
    // de SU PROPIA moneda, no siempre a PEN.
    const [partnerCosts, royaltyCosts, teachingCosts] = await Promise.all([
      this.getPartnerInstitutionCosts({ from, to }),
      this.getRoyaltyCosts({ from, to }),
      this.getTeachingHoursCost({ from, to }),
    ]);
    const currencies = new Set<string>([
      "PEN",
      ...incomeByCurrency.keys(),
      ...expensesByCurrency.map((e) => e.currency),
      ...partnerCosts.byCurrency.keys(),
      ...royaltyCosts.byCurrency.keys(),
      ...teachingCosts.byCurrency.keys(),
    ]);

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
      const detraction = detractionByCurrency.get(currency) ?? 0;
      const providerFees = feesByCurrency.get(currency) ?? 0;
      const otherExpenses =
        (expensesMap.get(currency) ?? 0) +
        (partnerCosts.byCurrency.get(currency) ?? 0) +
        (royaltyCosts.byCurrency.get(currency) ?? 0) +
        (teachingCosts.byCurrency.get(currency) ?? 0);
      return {
        currency,
        income,
        igv,
        detraction,
        // Monto real a depositar al Banco de la Nación, siempre en soles —
        // para PEN es el mismo número que `detraction`; para USD es el
        // equivalente convertido al tipo de cambio del día (usdExchangeRate).
        detractionPenEquivalent: detractionPenByCurrency.get(currency) ?? 0,
        providerFees,
        otherExpenses,
        balance: income - igv - detraction - providerFees - otherExpenses,
      };
    });

    // "En finanzas me figura 'otros gastos' pero no sé su detalle" — el
    // desglose YA se calculaba (partnerCosts/royaltyCosts/teachingHoursCost
    // arriba) pero solo tenía `courseId` crudo, nunca se mostraba en la
    // pantalla. Se le agrega el título del curso acá (una sola consulta)
    // para que /admin/finanzas pueda listarlo de forma legible.
    const referencedCourseIds = Array.from(new Set([...partnerCosts.breakdown.map((b) => b.courseId), ...royaltyCosts.breakdown.map((b) => b.courseId)]));
    const referencedCourses =
      referencedCourseIds.length > 0
        ? await this.prisma.course.findMany({ where: { id: { in: referencedCourseIds } }, select: { id: true, title: true } })
        : [];
    const courseTitleById = new Map(referencedCourses.map((c) => [c.id, c.title]));

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      taxAffectation,
      igvPercent,
      culqiFeePercent,
      stripeFeePercent,
      yapeFeePercent,
      plinFeePercent,
      usdExchangeRate,
      exchangeRateSourceUrl,
      ...detractionSettings,
      availableYears: availableYears.map((r) => r.year),
      partnerCosts: partnerCosts.breakdown.map((b) => ({ ...b, courseTitle: courseTitleById.get(b.courseId) ?? null })),
      royaltyCosts: royaltyCosts.breakdown.map((b) => ({ ...b, courseTitle: courseTitleById.get(b.courseId) ?? null })),
      teachingHoursCost: { hours: teachingCosts.totalHours, byCurrency: Object.fromEntries(teachingCosts.byCurrency) },
      manualExpensesByCurrency: Object.fromEntries(expensesMap),
      rows,
    };
  }

  /**
   * "Un botón de detalle para ver esas cifras que se encuentran generales
   * en el detalle de los ingresos y egresos separados por categoría, ya
   * sea diario, semanal, mensual, anual, o en las fechas que se estime" —
   * getFinancialSummary da UN total por el rango completo; esto lo parte
   * en cubos de tiempo (día/semana/mes/año) para poder ver la evolución,
   * más un desglose de "otros gastos" por categoría real (antes solo
   * salía como un total ciego por moneda).
   */
  async getFinancialDetail(params: { from?: string; to?: string; groupBy: "day" | "week" | "month" | "year" }) {
    const to = params.to ? new Date(params.to) : new Date();
    const from = params.from ? new Date(params.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const bucketExpr = { day: "day", week: "week", month: "month", year: "year" }[params.groupBy];

    const [incomeBuckets, expenseBuckets, expensesByCategory] = await Promise.all([
      this.prisma.$queryRawUnsafe<Array<{ bucket: Date; currency: string; total: string }>>(
        `SELECT date_trunc('${bucketExpr}', "createdAt") as bucket, currency, SUM(total)::text as total
         FROM "Order" WHERE status = 'PAID' AND "createdAt" >= $1 AND "createdAt" <= $2
         GROUP BY bucket, currency ORDER BY bucket ASC`,
        from,
        to,
      ),
      this.prisma.$queryRawUnsafe<Array<{ bucket: Date; currency: string; total: string }>>(
        `SELECT date_trunc('${bucketExpr}', "incurredAt") as bucket, currency, SUM(amount)::text as total
         FROM "PlatformExpense" WHERE "incurredAt" >= $1 AND "incurredAt" <= $2
         GROUP BY bucket, currency ORDER BY bucket ASC`,
        from,
        to,
      ),
      this.prisma.platformExpense.groupBy({
        by: ["category", "currency"],
        where: { incurredAt: { gte: from, lte: to } },
        _sum: { amount: true },
      }),
    ]);

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      groupBy: params.groupBy,
      income: incomeBuckets.map((b) => ({ bucket: b.bucket.toISOString(), currency: b.currency, amount: Number(b.total) })),
      expenses: expenseBuckets.map((b) => ({ bucket: b.bucket.toISOString(), currency: b.currency, amount: Number(b.total) })),
      expensesByCategory: expensesByCategory.map((e) => ({ category: e.category, currency: e.currency, amount: Number(e._sum.amount ?? 0) })),
    };
  }

  async updateFeeSettings(
    input: {
      culqiFeePercent?: number;
      stripeFeePercent?: number;
      yapeFeePercent?: number;
      plinFeePercent?: number;
      detractionEnabled?: boolean;
      detractionRucNaturalPercent?: number;
      detractionRucNaturalThreshold?: number;
      detractionRucEmpresaPercent?: number;
      usdExchangeRate?: number;
      exchangeRateSourceUrl?: string | null;
    },
    actorId?: string,
  ) {
    // "Cambiar el % de comisión de pasarela o la detracción no deja
    // registro de quién ni cuándo, y además todos los reportes pasados
    // cambian retroactivamente al recalcularlos con el valor nuevo" —
    // hallazgo de auditoría. Esto resuelve el "quién/cuándo" — el
    // recálculo retroactivo de reportes históricos queda como una decisión
    // de arquitectura más grande (historizar las tasas), no algo bounded
    // para arreglar en el mismo cambio.
    const before = await this.prisma.platformSettings.findUnique({ where: { id: "default" } });
    const updated = await this.prisma.platformSettings.upsert({ where: { id: "default" }, create: { id: "default", ...input }, update: input });
    await logAudit(this.prisma, { actorId, action: "FEE_SETTINGS_UPDATE", entity: "PlatformSettings", entityId: "default", before: before as never, after: input as never });
    return updated;
  }

  /**
   * Logo configurado en PlatformSettings, descargado para incrustar en el
   * PDF — mismo patrón que ReportsService.logoBytes (duplicado a propósito,
   * es un helper de 8 líneas, no vale la pena acoplar los dos módulos solo
   * por esto). Best-effort: sin logo configurado o si falla la descarga,
   * el PDF se genera igual (report-kit.ts cae a texto "INKADEMY").
   */
  private async financialReportLogoBytes(): Promise<Buffer | null> {
    const settings = await this.prisma.platformSettings.findUnique({ where: { id: "default" } });
    if (!settings?.logoUrl) return null;
    try {
      const res = await fetch(settings.logoUrl);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  /**
   * "Resumen ejecutivo con IA" — 2-3 oraciones en lenguaje natural sobre
   * summary/pnl (ya calculados en buildFinancialReport). Nunca bloquea el
   * reporte: si el asistente está apagado o Gemini falla, se omite en
   * silencio (null) y el PDF sale exactamente igual que sin esta feature.
   */
  private async buildFinancialAiSummary(summary: any, pnl: any): Promise<string | null> {
    try {
      const systemPrompt = [
        "Eres un analista financiero. Redacta un resumen ejecutivo de 2 a 3 oraciones, en español, para un dueño de negocio sin formación contable.",
        "Sé concreto y directo — sin inventar cifras que no te doy, sin recomendaciones genéricas de relleno.",
        "Responde ÚNICAMENTE con el texto del resumen, sin encabezados ni comillas.",
      ].join("\n");
      const userText = JSON.stringify({
        balances: (summary.rows as any[]).map((r) => ({ currency: r.currency, income: r.income, balance: r.balance })),
        puntoEquilibrioMensual: pnl.breakEvenIncome,
        crecimientoMensualPromedioPct: pnl.avgGrowthPct,
        proyeccionProximoMes: pnl.forecastNextMonth,
        estado: pnl.status,
      });
      return await callGeminiOnce(this.prisma, systemPrompt, userText, { maxOutputTokens: 300 });
    } catch {
      return null;
    }
  }

  /** Arma el PDF del estado financiero para el periodo pedido — reutilizado por descarga directa y por envío a correo. */
  private async buildFinancialReport(params: { from?: string; to?: string; period?: string; year?: number; months?: number }) {
    const [summary, pnl, logoBytes] = await Promise.all([
      this.getFinancialSummary(params),
      this.getProfitAndLoss({ months: params.months }),
      this.financialReportLogoBytes(),
    ]);
    const periodLabel =
      params.period === "allTime"
        ? "todo el periodo"
        : params.period === "lastYear"
          ? "el último año"
          : params.period === "year" && params.year
            ? `año ${params.year}`
            : "últimos 30 días";
    const aiSummary = await this.buildFinancialAiSummary(summary, pnl);
    const pdf = await buildFinancialReportPdf(summary, pnl, logoBytes, aiSummary);
    return { pdf, periodLabel };
  }

  async getFinancialReportPdf(params: { from?: string; to?: string; period?: string; year?: number; months?: number }) {
    return this.buildFinancialReport(params);
  }

  async emailFinancialReport(to: string, params: { from?: string; to?: string; period?: string; year?: number; months?: number }) {
    const { pdf, periodLabel } = await this.buildFinancialReport(params);
    const key = `admin-reports/finanzas-${randomUUID()}.pdf`;
    await this.storageService.uploadBuffer(key, pdf, "application/pdf");
    const url = this.storageService.getPublicUrl(key) ?? (await this.storageService.getSignedUrl(key, 60 * 60 * 24 * 7));
    await this.notificationService.sendFinancialReport(to, url, periodLabel);
    return { sent: true, to };
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

  // --- "Casos extemporáneos" (antes "Matrículas") — el módulo NO debe listar
  // toda matrícula, solo los alumnos que no terminaron el curso dentro del
  // plazo establecido: accessExpiresAt ya vencido y todavía no COMPLETED.
  // Ampliar el plazo de acceso sigue siendo la acción especial del admin
  // sobre esa fila puntual (ver extendEnrollmentAccess).

  // "El admin debería poder resetear un avance en casos extremos" — esta
  // lista nació acotada a "casos extemporáneos" (acceso vencido, sin
  // terminar) para el caso de ampliar plazo. Buscar un alumno puntual por
  // nombre/correo (con `q`) ahora amplía la búsqueda a TODAS sus
  // matrículas, no solo las de acceso vencido — el admin necesita poder
  // encontrar la matrícula de un alumno para resetear su avance sin que
  // esté necesariamente vencida.
  async listEnrollments(q?: string) {
    const now = new Date();
    const enrollments = await this.prisma.enrollment.findMany({
      where: q
        ? {
            OR: [
              { user: { email: { contains: q, mode: "insensitive" } } },
              { user: { firstName: { contains: q, mode: "insensitive" } } },
              { user: { lastName: { contains: q, mode: "insensitive" } } },
            ],
          }
        : { accessExpiresAt: { lt: now }, status: { not: "COMPLETED" } },
      include: { user: true, course: true, program: true },
      orderBy: q ? { enrolledAt: "desc" } : { accessExpiresAt: "desc" },
      take: 100,
    });
    return enrollments.map((e) => ({
      id: e.id,
      userName: `${e.user.firstName} ${e.user.lastName}`,
      userEmail: e.user.email,
      offeringTitle: (e.course?.title ?? e.program?.title ?? {}) as Record<string, string>,
      offeringKind: e.offeringKind,
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

  async listUsers(params: { q?: string; role?: string; pageSize?: number }) {
    const users = await this.prisma.user.findMany({
      where: {
        // "Cuando quiero asignarme un curso no aparece mi nombre" — antes
        // solo miraba `globalRole`, así que alguien con TEACHER únicamente
        // en `secondaryRoles` (un ADMIN que también da clases, por ejemplo)
        // quedaba invisible en este listado, incluida la lista de docentes
        // de CourseEditor. Acá también se usa AND en vez de anidar otro OR
        // a nivel raíz junto al de `q` — dos claves "OR" en el mismo objeto
        // se pisarían entre sí.
        AND: [
          params.role
            ? { OR: [{ globalRole: params.role as never }, { secondaryRoles: { has: params.role as never } }] }
            : {},
          params.q
            ? {
                OR: [
                  { email: { contains: params.q, mode: "insensitive" as const } },
                  { firstName: { contains: params.q, mode: "insensitive" as const } },
                  { lastName: { contains: params.q, mode: "insensitive" as const } },
                ],
              }
            : {},
        ],
      },
      // Antes no se veía a qué empresa pertenece cada cuenta desde
      // /admin/usuarios — había que entrar empresa por empresa a buscarlo.
      include: {
        companyMemberships: { where: { status: { not: "REMOVED" } }, include: { company: true } },
        // "Agruparlos por: los que están llevando un curso o más, los que ya
        // culminaron y no están llevando nada, los que aún no han llevado
        // ninguno... con un indicador tipo semáforo" — solo se trae el
        // `status` de cada matrícula (no el curso completo) porque acá solo
        // hace falta contar, no listar.
        enrollments: { select: { status: true } },
      },
      orderBy: { createdAt: "desc" },
      // "Borrar usuarios (uno, algunos, todos)" en la zona de pruebas
      // necesita ver la lista COMPLETA, no solo los 100 más recientes (el
      // límite por defecto que basta para /admin/usuarios de uso normal).
      take: Math.min(2000, params.pageSize ?? 100),
    });
    return users.map((u) => {
      const total = u.enrollments.length;
      const active = u.enrollments.filter((e) => e.status === "ACTIVE").length;
      const completed = u.enrollments.filter((e) => e.status === "COMPLETED").length;
      const enrollmentGroup: "EN_CURSO" | "COMPLETADO" | "SIN_CURSOS" = active > 0 ? "EN_CURSO" : completed > 0 ? "COMPLETADO" : "SIN_CURSOS";
      return {
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        displayName: u.displayName,
        globalRole: u.globalRole,
        secondaryRoles: u.secondaryRoles,
        status: u.status,
        createdAt: u.createdAt.toISOString(),
        // Firma para certificados (solo tiene sentido para TEACHER, pero se
        // devuelve para cualquier fila — la UI solo la ofrece para docentes).
        signatureAssetId: u.signatureAssetId,
        signatureUrl: u.signatureAssetId ? this.storageService.getPublicUrl(u.signatureAssetId) : null,
        // membershipId: necesario para poder "quitar de la empresa" desde acá
        // (companyApi.removeMember pide companyId + membershipId, no userId).
        companies: u.companyMemberships.map((m) => ({ membershipId: m.id, companyId: m.companyId, companyName: m.company.legalName, role: m.role })),
        // "El admin debería poder editar a cualquier usuario" — se exponen acá
        // los campos de perfil editables (ver updateUserSchema) para poder
        // precargar el formulario de edición.
        phone: u.phone,
        documentType: u.documentType,
        documentNumber: u.documentNumber,
        country: u.country,
        city: u.city,
        address: u.address,
        jobTitle: u.jobTitle,
        companyFreeText: u.companyFreeText,
        avatarUrl: u.avatarUrl,
        enrollmentStats: { total, active, completed, group: enrollmentGroup },
      };
    });
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
  async updateUser(
    id: string,
    actorId: string,
    input: {
      globalRole?: string;
      secondaryRoles?: string[];
      status?: string;
      signatureAssetId?: string | null;
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string | null;
      documentType?: string | null;
      documentNumber?: string | null;
      country?: string | null;
      city?: string | null;
      address?: string | null;
      jobTitle?: string | null;
      companyFreeText?: string | null;
      avatarUrl?: string | null;
    },
  ) {
    if (id === actorId) {
      const existing = await this.prisma.user.findUnique({ where: { id } });
      const nextGlobalRole = input.globalRole ?? existing?.globalRole;
      const nextSecondaryRoles = input.secondaryRoles ?? existing?.secondaryRoles ?? [];
      // "Un docente podría ser también administrador" relaja la regla vieja
      // (que bloqueaba CUALQUIER cambio de globalRole fuera de ADMIN) — ahora
      // solo importa que, al terminar, ADMIN siga presente en ALGÚN rol
      // (principal o secundario) de su propia cuenta, para no quedarse sin
      // acceso a este mismo panel.
      const staysAdmin = nextGlobalRole === "ADMIN" || nextSecondaryRoles.includes("ADMIN" as never);
      if (input.status === "disabled" || !staysAdmin) {
        throw new BadRequestException("No puedes desactivar tu propia cuenta ni quitarte el rol de administrador");
      }
    }
    // Un rol no puede estar a la vez como principal y como secundario.
    const data: Record<string, unknown> = { ...input };
    if (input.secondaryRoles) {
      const globalRole = input.globalRole ?? (await this.prisma.user.findUnique({ where: { id }, select: { globalRole: true } }))?.globalRole;
      data.secondaryRoles = input.secondaryRoles.filter((r) => r !== globalRole);
    }
    // "Un cambio de rol o una desactivación de cuenta no deja ningún
    // registro de qué admin lo hizo" — hallazgo de auditoría de
    // trazabilidad. Se guarda el "antes" solo de los campos que de verdad
    // cambian (rol/estado), no el perfil completo, para no inflar el log
    // con ediciones de nombre/teléfono sin relevancia de seguridad.
    const before = await this.prisma.user.findUnique({
      where: { id },
      select: { globalRole: true, secondaryRoles: true, status: true },
    });
    try {
      const updated = await this.prisma.user.update({ where: { id }, data: data as never });
      if (input.globalRole !== undefined || input.secondaryRoles !== undefined || input.status !== undefined) {
        await logAudit(this.prisma, {
          actorId,
          action: "USER_UPDATE",
          entity: "User",
          entityId: id,
          before: before as never,
          after: { globalRole: updated.globalRole, secondaryRoles: updated.secondaryRoles, status: updated.status },
        });
      }
      return updated;
    } catch (err) {
      // P2002 = violación de índice único — el único campo editable acá que
      // choca con otro usuario es el correo.
      if ((err as { code?: string })?.code === "P2002") {
        throw new BadRequestException("Ya existe otro usuario con ese correo.");
      }
      throw err;
    }
  }

  /**
   * El admin resetea la contraseña de un usuario que se lo pidió (p.ej. por
   * soporte, sin pasar por el flujo de "olvidé mi contraseña" por correo).
   * Si no manda una contraseña específica, genera una temporal — mismo
   * patrón que createUser — para pasársela al usuario por otro medio.
   */
  async resetUserPassword(id: string, actorId: string, password?: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("Usuario no encontrado");

    const tempPassword = password ? null : randomUUID().slice(0, 12);
    const passwordHash = await argon2.hash(password ?? tempPassword!);
    // "Un usuario podría tenerlo abierto en más de un dispositivo" — un
    // reset de contraseña por el admin también rota currentSessionId,
    // cerrando cualquier sesión que esta cuenta tuviera abierta en
    // cualquier dispositivo (mismo mecanismo que AuthService.changePassword/
    // resetPassword). El admin que lo ejecuta no es el afectado, así que
    // no hace falta reemitirle tokens a nadie acá.
    await this.prisma.user.update({ where: { id }, data: { passwordHash, currentSessionId: randomUUID() } });
    // Nunca se guarda la contraseña en el log — solo que se restableció y quién lo hizo.
    await logAudit(this.prisma, { actorId, action: "USER_PASSWORD_RESET", entity: "User", entityId: id });
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
    const reason = await this.userDeleteBlockReason(id);
    if (reason) throw new BadRequestException(reason);
    await this.deleteUserUnsafe(id, actorId);
    return { deleted: true };
  }

  /** null = se puede borrar; si no, el motivo por el que está bloqueado. */
  private async userDeleteBlockReason(id: string): Promise<string | null> {
    const [ordersCount, certificatesCount, enrollmentsCount] = await Promise.all([
      this.prisma.order.count({ where: { userId: id } }),
      this.prisma.certificate.count({ where: { userId: id } }),
      this.prisma.enrollment.count({ where: { userId: id } }),
    ]);
    if (ordersCount > 0 || certificatesCount > 0 || enrollmentsCount > 0) {
      return "Tiene órdenes, certificados o matrículas — desactívala en su lugar.";
    }
    return null;
  }

  /** Sin chequeos de seguridad — el llamador ya validó que se puede borrar. */
  private async deleteUserUnsafe(id: string, actorId: string) {
    const deletedSnapshot = await this.prisma.user.findUnique({
      where: { id },
      select: { email: true, firstName: true, lastName: true, globalRole: true },
    });
    await this.prisma.user.delete({ where: { id } });
    await logAudit(this.prisma, { actorId, action: "USER_DELETE", entity: "User", entityId: id, before: deletedSnapshot as never });
  }

  /**
   * "Borrar usuarios (uno, algunos, todos)" en la zona de pruebas del admin
   * — mismo criterio de seguridad que deleteUser, pero por lote: lo que no
   * está "limpio" se omite (con el motivo) en vez de abortar todo el lote.
   */
  async bulkDeleteUsers(ids: string[], actorId: string) {
    const deleted: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const id of ids) {
      if (id === actorId) {
        skipped.push({ id, reason: "No puedes eliminar tu propia cuenta" });
        continue;
      }
      const reason = await this.userDeleteBlockReason(id);
      if (reason) {
        skipped.push({ id, reason });
        continue;
      }
      await this.deleteUserUnsafe(id, actorId);
      deleted.push(id);
    }
    return { deleted, skipped };
  }

  /**
   * "Borrar los cursos dados (uno, algunos, todos)" — a diferencia del
   * archivado normal (Course.status → ARCHIVED, el único mecanismo hasta
   * ahora), esto elimina la fila de verdad. Solo si nunca generó actividad
   * real: sin matrículas, sin ítems de orden (aunque OrderItem.courseId no
   * tiene FK, si hubiera alguno igual protege la facturación histórica),
   * sin certificados, sin cupos B2B. La cascada del schema se encarga de
   * módulos/lecciones/materiales/exámenes del curso.
   */
  async bulkDeleteCourses(ids: string[], actorId: string) {
    const deleted: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const id of ids) {
      const [enrollments, orderItems, certificates, seatPools, programCourses] = await Promise.all([
        this.prisma.enrollment.count({ where: { courseId: id } }),
        this.prisma.orderItem.count({ where: { courseId: id } }),
        this.prisma.certificate.count({ where: { courseId: id } }),
        this.prisma.companySeatPool.count({ where: { courseId: id } }),
        // ProgramCourse_courseId_fkey es ON DELETE RESTRICT (único FK no-cascada
        // de Course) — sin este chequeo, prisma.course.delete tiraría un P2003
        // crudo en vez de un "skipped" legible.
        this.prisma.programCourse.count({ where: { courseId: id } }),
      ]);
      if (enrollments > 0 || orderItems > 0 || certificates > 0 || seatPools > 0 || programCourses > 0) {
        skipped.push({ id, reason: "Tiene matrículas, compras, certificados, cupos B2B o es parte de un programa — archívalo en su lugar" });
        continue;
      }
      const snapshot = await this.prisma.course.findUnique({ where: { id }, select: { title: true, slug: true } });
      if (!snapshot) {
        skipped.push({ id, reason: "No existe" });
        continue;
      }
      await this.prisma.course.delete({ where: { id } });
      await logAudit(this.prisma, { actorId, action: "COURSE_DELETE", entity: "Course", entityId: id, before: snapshot as never });
      deleted.push(id);
    }
    return { deleted, skipped };
  }

  /** Igual criterio que bulkDeleteCourses: solo se borra un área si ningún curso la referencia. */
  async bulkDeleteAreas(ids: string[], actorId: string) {
    const deleted: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const id of ids) {
      const coursesCount = await this.prisma.course.count({ where: { areaId: id } });
      if (coursesCount > 0) {
        skipped.push({ id, reason: "Tiene cursos asignados a esta área" });
        continue;
      }
      const snapshot = await this.prisma.area.findUnique({ where: { id }, select: { slug: true, name: true } });
      if (!snapshot) {
        skipped.push({ id, reason: "No existe" });
        continue;
      }
      await this.prisma.area.delete({ where: { id } });
      await logAudit(this.prisma, { actorId, action: "AREA_DELETE", entity: "Area", entityId: id, before: snapshot as never });
      deleted.push(id);
    }
    return { deleted, skipped };
  }

  /** Empresas B2B de prueba: solo se borran sin órdenes/matrículas reales ni cupos ya usados. */
  async bulkDeleteCompanies(ids: string[], actorId: string) {
    const deleted: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const id of ids) {
      const [orders, enrollments, seatPoolsUsed] = await Promise.all([
        this.prisma.order.count({ where: { companyId: id } }),
        this.prisma.enrollment.count({ where: { companyId: id } }),
        this.prisma.companySeatPool.count({ where: { companyId: id, seatsUsed: { gt: 0 } } }),
      ]);
      if (orders > 0 || enrollments > 0 || seatPoolsUsed > 0) {
        skipped.push({ id, reason: "Tiene órdenes, matrículas o cupos B2B ya usados" });
        continue;
      }
      const snapshot = await this.prisma.company.findUnique({ where: { id }, select: { legalName: true, taxId: true } });
      if (!snapshot) {
        skipped.push({ id, reason: "No existe" });
        continue;
      }
      await this.prisma.company.delete({ where: { id } });
      await logAudit(this.prisma, { actorId, action: "COMPANY_DELETE", entity: "Company", entityId: id, before: snapshot as never });
      deleted.push(id);
    }
    return { deleted, skipped };
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
      canEdit: s.canEdit,
    }));
  }

  /** "El administrador podría bloquearle esos accesos [de edición]" — no desasigna al docente, solo apaga/prende su permiso de escritura en este curso. */
  async setCourseStaffCanEdit(id: string, canEdit: boolean) {
    return this.prisma.courseStaff.update({ where: { id }, data: { canEdit } });
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

  // --- Backups descargables ("toda la base de datos... que si se pierde
  // lo pueda recuperar") — el trabajo pesado (armar el zip, subirlo) vive
  // en apps/worker (ver backup.processor.ts); acá solo se encola y se
  // consulta el historial. ---

  async listBackups() {
    return this.prisma.backupRecord.findMany({
      include: { triggeredBy: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async generateBackupNow(actorId: string) {
    await this.backupQueue.add(BACKUP_JOBS.GENERATE, { trigger: "MANUAL", triggeredById: actorId });
    return { queued: true };
  }

  async getBackupDownloadUrl(id: string) {
    const record = await this.prisma.backupRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException("Backup no encontrado");
    if (record.status !== "DONE" || !record.s3Key) throw new BadRequestException("Este backup todavía no está listo");
    return { url: await this.storageService.getSignedUrl(record.s3Key, 900) };
  }

  // --- Auditoría genérica ("bucear en el histórico", "sustentar lo que
  // sucedió en un momento dado") — lee AuditLog, hoy solo alimentado por
  // logAudit() en los 20+ call sites de apps/api. ---

  async listAuditLog(filters: { entity?: string; action?: string; actorId?: string; from?: Date; to?: Date }, page = 1, pageSize = 30) {
    const where = {
      ...(filters.entity ? { entity: filters.entity } : {}),
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.actorId ? { actorId: filters.actorId } : {}),
      ...(filters.from || filters.to
        ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { rows, total, page, pageSize };
  }

  /**
   * "Traducción asistida" — genérico, no específico de curso (aunque el
   * primer uso real es Course.title, ver CourseEditor.tsx). Devuelve el
   * texto traducido sin persistir nada; el admin lo revisa antes de guardar.
   */
  async translateText(text: string, from: ScormLocale, to: ScormLocale): Promise<{ translated: string }> {
    const langName = (l: ScormLocale) =>
      ({ es: "español", en: "inglés", it: "italiano", fr: "francés", pt: "portugués" })[l];
    const systemPrompt = `Traduce el siguiente texto de ${langName(from)} a ${langName(to)}. Responde ÚNICAMENTE con la traducción, sin comillas ni explicaciones.`;
    const translated = await callGeminiOnce(this.prisma, systemPrompt, text, { maxOutputTokens: 256 });
    return { translated };
  }
}

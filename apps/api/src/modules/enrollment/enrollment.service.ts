import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import type { PrismaClient } from "@inkademy/db";
import type { EnrollmentSummaryDTO, EnrollmentStatus } from "@inkademy/shared";
import { PRISMA } from "../../common/prisma/prisma.module";
import { StorageService } from "../../storage/storage.service";
import { QUEUE_NAMES, RECOMMENDATION_JOBS } from "../../common/queues/queue.constants";
import { CertificateService } from "../certificate/certificate.service";
import { CatalogService } from "../catalog/catalog.service";

@Injectable()
export class EnrollmentService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
    private readonly certificateService: CertificateService,
    private readonly catalogService: CatalogService,
    @InjectQueue(QUEUE_NAMES.RECOMMENDATION) private readonly recommendationQueue: Queue,
  ) {}

  private async computeApprovalMissing(courseId: string, enrollmentId: string): Promise<string[]> {
    const [rule, enrollment, bestAttempt, attendanceStats, assessmentCount] = await Promise.all([
      this.prisma.approvalRule.findUnique({ where: { courseId } }),
      this.prisma.enrollment.findUnique({ where: { id: enrollmentId } }),
      this.prisma.assessmentAttempt.findFirst({
        where: { enrollmentId, status: { in: ["GRADED", "PASSED", "FAILED"] } },
        orderBy: { score: "desc" },
      }),
      this.prisma.liveSession.count({ where: { courseId } }),
      this.prisma.assessment.count({ where: { courseId } }),
    ]);
    if (!rule || !enrollment) return [];

    const missing: string[] = [];
    if (enrollment.progressPct < rule.minProgressPct) {
      missing.push(
        `Completa el ${rule.minProgressPct}% del curso (llevas ${Math.round(enrollment.progressPct)}%)`,
      );
    }
    if (rule.minAttendancePct !== null && attendanceStats > 0) {
      const attended = await this.prisma.attendance.count({
        where: { userId: enrollment.userId, liveSession: { courseId }, joinedAt: { not: null } },
      });
      const attendancePct = (attended / attendanceStats) * 100;
      if (attendancePct < rule.minAttendancePct) {
        missing.push(
          `Alcanza ${rule.minAttendancePct}% de asistencia a clases en vivo (llevas ${Math.round(attendancePct)}%)`,
        );
      }
    }
    // Solo exigir nota mínima si el curso tiene al menos una evaluación configurada
    // — de lo contrario un `minScore: 0` (curso sin examen) generaría un requisito
    // sin sentido ("aprueba una evaluación con nota mínima 0").
    if (assessmentCount > 0) {
      const bestScore = bestAttempt?.score ?? null;
      if (bestScore === null || bestScore < rule.minScore) {
        missing.push(
          `Aprueba una evaluación con nota mínima ${rule.minScore}${bestScore !== null ? ` (tu mejor nota: ${bestScore})` : ""}`,
        );
      }
    }
    if (rule.requiresAssignment) {
      const gradedAssignment = await this.prisma.answer.findFirst({
        where: {
          attempt: { enrollmentId },
          question: { type: "OPEN" },
          isCorrect: true,
        },
      });
      if (!gradedAssignment) missing.push("Entrega y aprueba la tarea/asignación del curso");
    }
    return missing;
  }

  private async nextActionLabel(courseId: string, enrollmentId: string): Promise<string | null> {
    const upcoming = await this.prisma.liveSession.findFirst({
      where: { courseId, startsAt: { gt: new Date() }, status: "SCHEDULED" },
      orderBy: { startsAt: "asc" },
    });
    if (upcoming) {
      return `Próxima clase: ${upcoming.startsAt.toLocaleString("es-PE")}`;
    }
    const nextLesson = await this.prisma.lesson.findFirst({
      where: {
        module: { courseId },
        progress: { none: { enrollmentId, completed: true } },
      },
      include: { module: true },
      orderBy: [{ module: { order: "asc" } }, { order: "asc" }],
    });
    if (nextLesson) return `Continúa en el Módulo ${nextLesson.module.order}`;
    return null;
  }

  async listMine(userId: string, status?: EnrollmentStatus): Promise<EnrollmentSummaryDTO[]> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId, ...(status ? { status } : {}) },
      include: { course: true, program: true, certificate: true },
      orderBy: { enrolledAt: "desc" },
    });

    return Promise.all(
      enrollments.map(async (e) => {
        const offering = e.course ?? e.program;
        const approvalMissing =
          e.offeringKind === "COURSE" && e.courseId
            ? await this.computeApprovalMissing(e.courseId, e.id)
            : [];
        const nextActionLabel =
          e.offeringKind === "COURSE" && e.courseId
            ? await this.nextActionLabel(e.courseId, e.id)
            : null;
        return {
          id: e.id,
          offeringKind: e.offeringKind,
          courseId: e.courseId,
          programId: e.programId,
          title: (offering?.title as Record<string, string>) ?? {},
          coverImageUrl:
            e.course?.coverImageAssetId ? this.storage.getPublicUrl(e.course.coverImageAssetId) : null,
          progressPct: e.progressPct,
          status: e.status,
          source: e.source,
          accessExpiresAt: e.accessExpiresAt?.toISOString() ?? null,
          nextActionLabel,
          certificateAvailable: Boolean(e.certificate && !e.certificate.revoked),
          approvalMissing,
        };
      }),
    );
  }

  async getMineDetail(userId: string, enrollmentId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        course: {
          include: {
            modules: { orderBy: { order: "asc" }, include: { lessons: { orderBy: { order: "asc" } } } },
          },
        },
        program: true,
        certificate: true,
        lessonProgress: true,
      },
    });
    if (!enrollment || enrollment.userId !== userId) {
      throw new NotFoundException("Matrícula no encontrada");
    }

    const progressByLesson = new Map(enrollment.lessonProgress.map((p) => [p.lessonId, p]));
    return {
      id: enrollment.id,
      offeringKind: enrollment.offeringKind,
      status: enrollment.status,
      source: enrollment.source,
      progressPct: enrollment.progressPct,
      accessExpiresAt: enrollment.accessExpiresAt?.toISOString() ?? null,
      certificateAvailable: Boolean(enrollment.certificate && !enrollment.certificate.revoked),
      course: enrollment.course
        ? {
            id: enrollment.course.id,
            slug: enrollment.course.slug,
            title: enrollment.course.title,
            modules: enrollment.course.modules.map((m) => ({
              id: m.id,
              order: m.order,
              title: m.title,
              lessons: m.lessons.map((l) => ({
                id: l.id,
                order: l.order,
                title: l.title,
                contentType: l.contentType,
                durationMinutes: l.durationMinutes,
                isFreePreview: l.isFreePreview,
                progress: progressByLesson.get(l.id)
                  ? {
                      completed: progressByLesson.get(l.id)!.completed,
                      lastPositionSeconds: progressByLesson.get(l.id)!.lastPositionSeconds,
                    }
                  : { completed: false, lastPositionSeconds: 0 },
              })),
            })),
          }
        : null,
      program: enrollment.program
        ? { id: enrollment.program.id, slug: enrollment.program.slug, title: enrollment.program.title }
        : null,
    };
  }

  async updateLessonProgress(
    userId: string,
    lessonId: string,
    input: { completed?: boolean; lastPositionSeconds?: number },
  ) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { module: true },
    });
    if (!lesson) throw new NotFoundException("Lección no encontrada");

    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        userId,
        offeringKind: "COURSE",
        courseId: lesson.module.courseId,
        status: { in: ["ACTIVE", "COMPLETED"] },
      },
      orderBy: { enrolledAt: "desc" },
    });
    if (!enrollment) throw new ForbiddenException("No estás matriculado en este curso");

    await this.prisma.lessonProgress.upsert({
      where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
      create: {
        enrollmentId: enrollment.id,
        lessonId,
        userId,
        completed: input.completed ?? false,
        lastPositionSeconds: input.lastPositionSeconds ?? 0,
      },
      update: {
        ...(input.completed !== undefined ? { completed: input.completed } : {}),
        ...(input.lastPositionSeconds !== undefined
          ? { lastPositionSeconds: input.lastPositionSeconds }
          : {}),
      },
    });

    const [totalLessons, completedLessons] = await Promise.all([
      this.prisma.lesson.count({ where: { module: { courseId: lesson.module.courseId } } }),
      this.prisma.lessonProgress.count({ where: { enrollmentId: enrollment.id, completed: true } }),
    ]);
    const progressPct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 10000) / 100 : 0;

    const updated = await this.prisma.enrollment.update({
      where: { id: enrollment.id },
      data: {
        progressPct,
        ...(progressPct >= 100 ? { status: "COMPLETED", completedAt: new Date() } : {}),
      },
    });

    await this.certificateService.checkAndIssueIfEligible(updated.id);
    await this.recommendationQueue.add(
      RECOMMENDATION_JOBS.REGENERATE_FOR_USER,
      { userId },
      { removeOnComplete: true, removeOnFail: 50 },
    );

    return { progressPct: updated.progressPct, status: updated.status };
  }

  /**
   * Lee recomendaciones ya generadas (tabla Recommendation, poblada por el
   * worker al procesar la cola "recommendation"). Si aún no hay ninguna
   * (worker no ha corrido / usuario nuevo), genera un fallback simple en
   * caliente basado en: cursos siguientes de matrículas completadas +
   * cursos que matchean los intereses del usuario.
   */
  async listRecommendations(userId: string) {
    const existing = await this.prisma.recommendation.findMany({
      where: { userId, dismissed: false, courseId: { not: null } },
      orderBy: { score: "desc" },
      take: 12,
    });

    if (existing.length > 0) {
      const cards = await this.catalogService.getCourseCardsByIds(
        existing.map((r) => r.courseId!).filter(Boolean),
      );
      const reasonByCourse = new Map(existing.map((r) => [r.courseId, r.reason]));
      return cards.map((c) => ({ ...c, reason: reasonByCourse.get(c.id) ?? "interest_match" }));
    }

    const [completed, user] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { userId, status: "COMPLETED", offeringKind: "COURSE" },
        include: { course: true },
      }),
      this.prisma.user.findUnique({ where: { id: userId } }),
    ]);

    const nextIds = new Set(completed.flatMap((e) => e.course?.nextRecommendedCourseIds ?? []));
    let fallbackCourses = await this.prisma.course.findMany({
      where: { id: { in: Array.from(nextIds) }, status: "PUBLISHED" },
      take: 8,
    });
    let reason: "completed_related" | "interest_match" = "completed_related";

    if (fallbackCourses.length === 0 && user?.interests?.length) {
      fallbackCourses = await this.prisma.course.findMany({
        where: { status: "PUBLISHED" },
        take: 40,
      });
      fallbackCourses = fallbackCourses.filter((c) =>
        user.interests.some((interest) =>
          JSON.stringify(c.title).toLowerCase().includes(interest.toLowerCase()),
        ),
      );
      reason = "interest_match";
      fallbackCourses = fallbackCourses.slice(0, 8);
    }

    const cards = await this.catalogService.getCourseCardsByIds(fallbackCourses.map((c) => c.id));
    return cards.map((c) => ({ ...c, reason }));
  }
}

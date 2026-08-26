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

  /**
   * Shape aplanado (enrollmentId/title/modules a nivel raíz, no anidado bajo
   * `course`) porque es exactamente lo que espera ClassroomDetail
   * (apps/web/src/lib/mock-data.ts) y lo que consume Classroom.tsx — antes
   * esta respuesta anidaba todo bajo `course`/`program` y usaba `id` en vez
   * de `enrollmentId`, así que con datos reales el aula virtual leía
   * `detail.modules` como `undefined` y fallaba en silencio (nunca se había
   * probado contra la API real, solo contra el mock).
   */
  async getMineDetail(userId: string, enrollmentId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        course: {
          include: {
            modules: {
              orderBy: { order: "asc" },
              include: {
                lessons: {
                  orderBy: { order: "asc" },
                  include: { materials: { where: { visible: true }, orderBy: { order: "asc" } } },
                },
                materials: { where: { visible: true }, orderBy: { order: "asc" } },
              },
            },
            // Un solo "assessmentId" para el botón "Ir a la evaluación" del
            // aula — si el curso llega a tener más de una evaluación, se usa
            // la primera (mismo criterio simple que ya asumía el frontend).
            assessments: { take: 1 },
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

    // El acceso se corta apenas pasa accessExpiresAt, sin depender de que el
    // sweep del worker ya haya marcado la matrícula EXPIRED — el corte es
    // inmediato, no depende del timing de un cron. "Luego de esa fecha el
    // usuario ya no podrá acceder al curso" (pedido explícito del admin).
    const accessBlocked = Boolean(enrollment.accessExpiresAt && enrollment.accessExpiresAt < new Date());

    const progressByLesson = new Map(enrollment.lessonProgress.map((p) => [p.lessonId, p]));
    // "Cuando agrego un link no se muestra... el usuario que tiene ese curso
    // no lo ve" — un material kind="link" no tiene assetId (nunca se subió
    // un archivo), así que su url viene de externalUrl tal cual.
    const materialDTO = (m: { id: string; title: string; assetId: string | null; externalUrl?: string | null; kind: string; category: string }) => ({
      id: m.id,
      title: m.title,
      kind: m.kind,
      category: m.category,
      url: m.kind === "link" ? m.externalUrl ?? null : m.assetId ? this.storage.getPublicUrl(m.assetId) : null,
    });

    const approvalMissing =
      enrollment.offeringKind === "COURSE" && enrollment.courseId && !accessBlocked
        ? await this.computeApprovalMissing(enrollment.courseId, enrollment.id)
        : [];

    return {
      enrollmentId: enrollment.id,
      offeringKind: enrollment.offeringKind,
      status: enrollment.status,
      source: enrollment.source,
      progressPct: enrollment.progressPct,
      accessExpiresAt: enrollment.accessExpiresAt?.toISOString() ?? null,
      accessBlocked,
      certificateAvailable: Boolean(enrollment.certificate && !enrollment.certificate.revoked),
      courseId: enrollment.course?.id ?? enrollment.program?.id ?? null,
      title: (enrollment.course?.title as Record<string, string>) ?? (enrollment.program?.title as Record<string, string>) ?? {},
      syllabusUrl: enrollment.course?.syllabusAssetId ? this.storage.getPublicUrl(enrollment.course.syllabusAssetId) : null,
      assessmentId: enrollment.course?.assessments?.[0]?.id,
      // "El examen solo lo visualizará el alumno una vez completado el
      // curso" — antes se mostraba el botón apenas existía una Assessment,
      // sin importar el avance. Se sigue devolviendo assessmentId (para
      // poder mostrar un mensaje explicando cuándo se desbloquea) pero el
      // frontend solo habilita el acceso real si assessmentUnlocked=true.
      assessmentUnlocked: enrollment.progressPct >= 100,
      // "El sistema no debe permitir que el usuario pueda descargar la
      // clase [principal]" — configurable por curso (Course.blockMainVideoDownload).
      blockMainVideoDownload: enrollment.course?.blockMainVideoDownload ?? true,
      approvalMissing,
      // Con el acceso vencido no se manda ni un solo material/video al
      // frontend (no solo se "esconde" visualmente) — igual que un material
      // oculto por el admin, el bloqueo real vive en la API, no en la UI.
      modules:
        accessBlocked || !enrollment.course
          ? []
          : enrollment.course.modules.map((m) => ({
              id: m.id,
              order: m.order,
              title: m.title,
              materials: m.materials.map(materialDTO),
              lessons: m.lessons.map((l) => ({
                id: l.id,
                order: l.order,
                title: l.title,
                contentType: l.contentType,
                durationMinutes: l.durationMinutes ?? undefined,
                isCourseStarter: l.isCourseStarter,
                videoUrl: l.videoAssetId ? this.storage.getPublicUrl(l.videoAssetId) ?? undefined : undefined,
                externalUrl: l.externalUrl,
                // Subtítulos/transcripción (Fase 2) — solo se manda la URL si
                // ya están listos (subtitlesStatus="READY"); mientras se
                // generan o si falló, el reproductor no muestra ningún <track>.
                subtitlesUrl:
                  l.subtitlesStatus === "READY" && l.subtitlesAssetId ? this.storage.getPublicUrl(l.subtitlesAssetId) ?? undefined : undefined,
                materials: l.materials.map(materialDTO),
                completed: progressByLesson.get(l.id)?.completed ?? false,
                lastPositionSeconds: progressByLesson.get(l.id)?.lastPositionSeconds ?? 0,
              })),
            })),
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
    if (enrollment.accessExpiresAt && enrollment.accessExpiresAt < new Date()) {
      throw new ForbiddenException(
        "Tu acceso a este curso venció. Si necesitas más tiempo, escribe a soporte para pedir una ampliación de plazo.",
      );
    }

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

  // --- Notas del alumno en el reproductor de clase ---
  // Antes vivían solo en localStorage del navegador (no sincronizaban entre
  // dispositivos, se perdían al limpiar caché). Todas las consultas van
  // filtradas por `userId` del JWT — un alumno nunca puede leer ni escribir
  // la nota de otro, sin necesidad de validar matrícula (la nota en sí no
  // expone nada del curso que el alumno no pueda ya ver).

  async getLessonNote(userId: string, lessonId: string) {
    const note = await this.prisma.lessonNote.findUnique({ where: { userId_lessonId: { userId, lessonId } } });
    return { content: note?.content ?? "", updatedAt: note?.updatedAt ?? null };
  }

  async upsertLessonNote(userId: string, lessonId: string, content: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId }, select: { id: true } });
    if (!lesson) throw new NotFoundException("Lección no encontrada");

    if (!content.trim()) {
      // Nota vaciada por el alumno — se borra la fila en vez de guardar "" (menos filas muertas).
      await this.prisma.lessonNote.deleteMany({ where: { userId, lessonId } });
      return { content: "", updatedAt: null };
    }
    const note = await this.prisma.lessonNote.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      create: { userId, lessonId, content },
      update: { content },
    });
    return { content: note.content, updatedAt: note.updatedAt };
  }
}

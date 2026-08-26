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
import { computeCourseScore } from "../assessment/course-score";

@Injectable()
export class EnrollmentService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
    private readonly certificateService: CertificateService,
    private readonly catalogService: CatalogService,
    @InjectQueue(QUEUE_NAMES.RECOMMENDATION) private readonly recommendationQueue: Queue,
  ) {}

  /**
   * `ratingRequired`/`readyForRatingPrompt` separados de `missing` (que sigue
   * siendo la lista completa para mostrar) porque el modal visual de
   * estrellas (ver CourseRatingPrompt en el frontend) solo debe aparecer
   * cuando el curso YA está terminado en todo lo demás — no tiene sentido
   * pedir la calificación de un curso a medias.
   */
  private async computeApprovalMissing(
    courseId: string,
    enrollmentId: string,
  ): Promise<{ missing: string[]; ratingRequired: boolean; readyForRatingPrompt: boolean }> {
    const [approvalRule, enrollment, attendanceStats, rating] = await Promise.all([
      this.prisma.approvalRule.findUnique({ where: { courseId } }),
      this.prisma.enrollment.findUnique({ where: { id: enrollmentId } }),
      this.prisma.liveSession.count({ where: { courseId } }),
      this.prisma.courseRating.findUnique({ where: { enrollmentId } }),
    ]);
    if (!enrollment) return { missing: [], ratingRequired: false, readyForRatingPrompt: false };
    // Mismo default que CertificateService.checkAndIssueIfEligible — un
    // curso sin ApprovalRule configurada (nunca hubo pantalla de admin para
    // crearla) NO debe fingir que no falta nada; antes esta lista quedaba
    // vacía siempre en ese caso, sin importar el avance real.
    const rule = approvalRule ?? {
      minProgressPct: 100,
      minAttendancePct: null as number | null,
      minScore: 70,
      requiresAssignment: false,
      scoreMode: "BEST_ATTEMPT",
    };
    // Mismo cálculo (mejor intento o promedio ponderado) que
    // CertificateService.checkAndIssueIfEligible — comparten esta función
    // para que los dos gates ("qué falta para aprobar" acá y "se emite el
    // certificado" allá) nunca queden desincronizados.
    const { hasAssessments, finalScore: bestScore } = await computeCourseScore(this.prisma, enrollmentId, courseId, rule.scoreMode ?? "BEST_ATTEMPT");

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
    if (hasAssessments) {
      if (bestScore === null || bestScore < rule.minScore) {
        const label = rule.scoreMode === "WEIGHTED_AVERAGE" ? "tu nota ponderada actual" : "tu mejor nota";
        missing.push(
          `Aprueba ${rule.scoreMode === "WEIGHTED_AVERAGE" ? "el promedio ponderado de las evaluaciones" : "una evaluación"} con nota mínima ${rule.minScore}${bestScore !== null ? ` (${label}: ${bestScore.toFixed(1)})` : ""}`,
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
    // "Si no responde [las estrellas] el curso no se podrá dar por
    // finalizado y el certificado no se podrá emitir" — se muestra como un
    // requisito más, igual que el resto (ver CertificateService.checkAndIssueIfEligible).
    const ratingRequired = !rating;
    const readyForRatingPrompt = ratingRequired && missing.length === 0;
    if (ratingRequired) missing.push("Califica el curso con estrellas y un comentario");
    return { missing, ratingRequired, readyForRatingPrompt };
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
        const approval =
          e.offeringKind === "COURSE" && e.courseId
            ? await this.computeApprovalMissing(e.courseId, e.id)
            : { missing: [], ratingRequired: false, readyForRatingPrompt: false };
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
          approvalMissing: approval.missing,
          readyForRatingPrompt: approval.readyForRatingPrompt,
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
        materialProgress: true,
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
    const readMaterialIds = new Set(enrollment.materialProgress.map((p) => p.materialId));
    // "Cuando agrego un link no se muestra... el usuario que tiene ese curso
    // no lo ve" — un material kind="link" no tiene assetId (nunca se subió
    // un archivo), así que su url viene de externalUrl tal cual.
    const materialDTO = (m: {
      id: string;
      title: string;
      assetId: string | null;
      externalUrl?: string | null;
      kind: string;
      category: string;
      allowDownload: boolean;
      allowView: boolean;
    }) => ({
      id: m.id,
      title: m.title,
      kind: m.kind,
      category: m.category,
      url: m.kind === "link" ? m.externalUrl ?? null : m.assetId ? this.storage.getPublicUrl(m.assetId) : null,
      allowDownload: m.allowDownload,
      allowView: m.allowView,
      // "El alumno deberá marcar como leído" — solo tiene sentido/se expone
      // para MAIN; el frontend igual no muestra el botón en SUPPLEMENTARY.
      read: m.category === "MAIN" ? readMaterialIds.has(m.id) : undefined,
    });

    const approval =
      enrollment.offeringKind === "COURSE" && enrollment.courseId && !accessBlocked
        ? await this.computeApprovalMissing(enrollment.courseId, enrollment.id)
        : { missing: [], ratingRequired: false, readyForRatingPrompt: false };
    const myRating =
      enrollment.offeringKind === "COURSE"
        ? await this.prisma.courseRating.findUnique({ where: { enrollmentId: enrollment.id } })
        : null;

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
      approvalMissing: approval.missing,
      readyForRatingPrompt: approval.readyForRatingPrompt,
      myRating: myRating ? { stars: myRating.stars, comment: myRating.comment } : null,
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
                formativeQuiz: l.formativeQuiz ?? null,
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

    return this.recomputeProgress(enrollment.id, lesson.module.courseId, userId);
  }

  /**
   * "Si un curso tiene lecturas principales el alumno deberá marcar como
   * leído para que el sistema entienda que ha leído ese documento; para las
   * lecturas complementarias no." Solo materiales category=MAIN cuentan
   * para el % de avance — un material SUPPLEMENTARY se rechaza acá para que
   * ninguna llamada (ni un futuro bug de frontend) pueda inflar el avance
   * marcando lecturas opcionales.
   */
  async markMaterialRead(userId: string, materialId: string) {
    const material = await this.prisma.material.findUnique({
      where: { id: materialId },
      include: { lesson: { include: { module: true } }, module: true },
    });
    if (!material) throw new NotFoundException("Material no encontrado");
    if (material.category !== "MAIN") {
      throw new ForbiddenException("Solo las lecturas principales se marcan como leídas");
    }
    const courseId = material.lesson?.module.courseId ?? material.module?.courseId;
    if (!courseId) throw new NotFoundException("Material no encontrado");

    const enrollment = await this.prisma.enrollment.findFirst({
      where: { userId, offeringKind: "COURSE", courseId, status: { in: ["ACTIVE", "COMPLETED"] } },
      orderBy: { enrolledAt: "desc" },
    });
    if (!enrollment) throw new ForbiddenException("No estás matriculado en este curso");
    if (enrollment.accessExpiresAt && enrollment.accessExpiresAt < new Date()) {
      throw new ForbiddenException("Tu acceso a este curso venció.");
    }

    await this.prisma.materialProgress.upsert({
      where: { enrollmentId_materialId: { enrollmentId: enrollment.id, materialId } },
      create: { enrollmentId: enrollment.id, materialId, userId },
      update: {},
    });

    return this.recomputeProgress(enrollment.id, courseId, userId);
  }

  /**
   * Recalcula progressPct sobre TODAS las unidades completables del curso:
   * lecciones (LessonProgress.completed) + lecturas principales
   * (MaterialProgress) — antes solo contaba lecciones, así que un curso con
   * lecturas obligatorias podía llegar a 100% sin que el alumno las hubiera
   * abierto nunca. Compartido por updateLessonProgress y markMaterialRead
   * para que ambos caminos usen el mismo denominador.
   */
  private async recomputeProgress(enrollmentId: string, courseId: string, userId: string) {
    const [totalLessons, completedLessons, totalMainMaterials, readMainMaterials] = await Promise.all([
      this.prisma.lesson.count({ where: { module: { courseId } } }),
      this.prisma.lessonProgress.count({ where: { enrollmentId, completed: true } }),
      this.prisma.material.count({
        where: { category: "MAIN", visible: true, OR: [{ lesson: { module: { courseId } } }, { module: { courseId } }] },
      }),
      this.prisma.materialProgress.count({ where: { enrollmentId } }),
    ]);
    const totalUnits = totalLessons + totalMainMaterials;
    const completedUnits = completedLessons + readMainMaterials;
    const progressPct = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 10000) / 100 : 0;

    const updated = await this.prisma.enrollment.update({
      where: { id: enrollmentId },
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

  /**
   * "Una vez que el alumno termina el curso debería aparecerle un mensaje
   * para marcar las estrellas... si no responde el curso no se podrá dar
   * por finalizado y el certificado no se podrá emitir". Al guardar la
   * calificación se reintenta la emisión del certificado por si era el
   * único requisito pendiente (ver CertificateService.checkAndIssueIfEligible).
   */
  async submitRating(userId: string, enrollmentId: string, stars: number, comment?: string) {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!enrollment || enrollment.userId !== userId) {
      throw new NotFoundException("Matrícula no encontrada");
    }
    if (enrollment.offeringKind !== "COURSE" || !enrollment.courseId) {
      throw new ForbiddenException("Solo se puede calificar una matrícula de curso");
    }
    await this.prisma.courseRating.upsert({
      where: { enrollmentId },
      create: { enrollmentId, userId, courseId: enrollment.courseId, stars, comment: comment ?? null },
      update: { stars, comment: comment ?? null },
    });
    await this.certificateService.checkAndIssueIfEligible(enrollmentId);
    return { saved: true };
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

  // "Hay una opción de Guardados. ¿Cómo guardo un curso? ¿Para qué sirve?"
  // — guardar un curso desde su ficha pública para decidir después, sin
  // matricularse todavía. No requiere que el curso esté publicado ya
  // matriculado ni nada más: es solo una lista personal de interés.
  async listSaved(userId: string) {
    const saved = await this.prisma.savedCourse.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
    return this.catalogService.getCourseCardsByIds(saved.map((s) => s.courseId));
  }

  async isSaved(userId: string, courseId: string) {
    const row = await this.prisma.savedCourse.findUnique({ where: { userId_courseId: { userId, courseId } } });
    return { saved: Boolean(row) };
  }

  async saveCourse(userId: string, courseId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId }, select: { id: true } });
    if (!course) throw new NotFoundException("Curso no encontrado");
    await this.prisma.savedCourse.upsert({
      where: { userId_courseId: { userId, courseId } },
      create: { userId, courseId },
      update: {},
    });
    return { saved: true };
  }

  async unsaveCourse(userId: string, courseId: string) {
    await this.prisma.savedCourse.deleteMany({ where: { userId, courseId } });
    return { saved: false };
  }
}

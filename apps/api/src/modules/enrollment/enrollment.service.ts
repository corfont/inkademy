import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import type { AccessDurationPolicy, PrismaClient } from "@inkademy/db";
import type { EnrollmentSummaryDTO, EnrollmentStatus } from "@inkademy/shared";
import { PRISMA } from "../../common/prisma/prisma.module";
import { StorageService } from "../../storage/storage.service";
import { QUEUE_NAMES, RECOMMENDATION_JOBS } from "../../common/queues/queue.constants";
import { CertificateService } from "../certificate/certificate.service";
import { CatalogService } from "../catalog/catalog.service";
import { CalendarService } from "../calendar/calendar.service";
import { computeCourseScore } from "../assessment/course-score";

function computeAccessExpiresAt(policy: AccessDurationPolicy, from: Date): Date | null {
  const date = new Date(from);
  if (policy === "DAYS_30") {
    date.setDate(date.getDate() + 30);
    return date;
  }
  if (policy === "MONTHS_6") {
    date.setMonth(date.getMonth() + 6);
    return date;
  }
  return null; // PERMANENT
}

@Injectable()
export class EnrollmentService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly storage: StorageService,
    private readonly certificateService: CertificateService,
    private readonly catalogService: CatalogService,
    private readonly calendarService: CalendarService,
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
  ): Promise<{ missing: string[]; checklist: { label: string; done: boolean }[]; ratingRequired: boolean; readyForRatingPrompt: boolean }> {
    const [approvalRule, enrollment, attendanceStats] = await Promise.all([
      this.prisma.approvalRule.findUnique({ where: { courseId } }),
      this.prisma.enrollment.findUnique({ where: { id: enrollmentId } }),
      this.prisma.liveSession.count({ where: { courseId } }),
    ]);
    if (!enrollment) return { missing: [], checklist: [], ratingRequired: false, readyForRatingPrompt: false };
    // "Si un alumno hace el curso varias veces, la calificación con
    // estrellas se da por hecha una sola vez, no de nuevo cada retake" —
    // antes se buscaba por ESTA matrícula (courseRating.enrollmentId es
    // único por matrícula), así que un retake SIEMPRE volvía a pedir
    // calificar. Ahora se busca por (usuario, curso) sin importar en cuál
    // de sus matrículas a ese curso calificó.
    const rating = await this.prisma.courseRating.findFirst({ where: { enrollment: { userId: enrollment.userId, courseId } } });
    // Mismo default que CertificateService.checkAndIssueIfEligible — un
    // curso sin ApprovalRule configurada (nunca hubo pantalla de admin para
    // crearla) NO debe fingir que no falta nada; antes esta lista quedaba
    // vacía siempre en ese caso, sin importar el avance real.
    const rule = approvalRule ?? {
      minProgressPct: 100,
      minAttendancePct: null as number | null,
      minConnectionMinutes: null as number | null,
      minScore: 70,
      requiresAssignment: false,
      scoreMode: "BEST_ATTEMPT",
    };
    // Mismo cálculo (mejor intento o promedio ponderado) que
    // CertificateService.checkAndIssueIfEligible — comparten esta función
    // para que los dos gates ("qué falta para aprobar" acá y "se emite el
    // certificado" allá) nunca queden desincronizados.
    const { hasAssessments, finalScore: bestScore } = await computeCourseScore(this.prisma, enrollmentId, courseId, rule.scoreMode ?? "BEST_ATTEMPT");

    // "La referencia explica el bloqueo con precisión y muestra un
    // checklist" — antes solo se armaba `missing[]` (lo que FALTA); ahora
    // se arma un `checklist` con TODOS los requisitos reales del curso,
    // cada uno con su `done`, para poder pintar en el Aula qué ya se
    // cumplió (no solo qué falta). `missing` se sigue devolviendo tal
    // cual (lo consume la tarjeta compacta de "Mis cursos"), derivado del
    // mismo checklist para que nunca queden desincronizados.
    const checklist: { label: string; done: boolean }[] = [];
    const progressDone = enrollment.progressPct >= rule.minProgressPct;
    checklist.push({
      label: progressDone
        ? `Completaste el ${rule.minProgressPct}% del curso`
        : `Completa el ${rule.minProgressPct}% del curso (llevas ${Math.round(enrollment.progressPct)}%)`,
      done: progressDone,
    });
    if (rule.minAttendancePct !== null && attendanceStats > 0) {
      const attended = await this.prisma.attendance.count({
        where: {
          userId: enrollment.userId,
          liveSession: { courseId },
          ...(rule.minConnectionMinutes !== null
            ? { durationMin: { gte: rule.minConnectionMinutes } }
            : { joinedAt: { not: null } }),
        },
      });
      const attendancePct = (attended / attendanceStats) * 100;
      const attendanceDone = attendancePct >= rule.minAttendancePct;
      checklist.push({
        label: attendanceDone
          ? `Alcanzaste ${rule.minAttendancePct}% de asistencia a clases en vivo`
          : `Alcanza ${rule.minAttendancePct}% de asistencia a clases en vivo (llevas ${Math.round(attendancePct)}%)`,
        done: attendanceDone,
      });
    }
    // Solo exigir nota mínima si el curso tiene al menos una evaluación configurada
    // — de lo contrario un `minScore: 0` (curso sin examen) generaría un requisito
    // sin sentido ("aprueba una evaluación con nota mínima 0").
    if (hasAssessments) {
      const scoreDone = bestScore !== null && bestScore >= rule.minScore;
      const label = rule.scoreMode === "WEIGHTED_AVERAGE" ? "tu nota ponderada actual" : "tu mejor nota";
      checklist.push({
        label: scoreDone
          ? `Aprobaste ${rule.scoreMode === "WEIGHTED_AVERAGE" ? "el promedio ponderado de las evaluaciones" : "una evaluación"} con nota mínima ${rule.minScore}/100 (${label}: ${bestScore!.toFixed(1)}/100)`
          : `Aprueba ${rule.scoreMode === "WEIGHTED_AVERAGE" ? "el promedio ponderado de las evaluaciones" : "una evaluación"} con nota mínima ${rule.minScore}/100${bestScore !== null ? ` (${label}: ${bestScore.toFixed(1)}/100)` : ""}`,
        done: scoreDone,
      });
    }
    if (rule.requiresAssignment) {
      const gradedAssignment = await this.prisma.answer.findFirst({
        where: {
          attempt: { enrollmentId },
          question: { type: "OPEN" },
          isCorrect: true,
        },
      });
      checklist.push({
        label: gradedAssignment ? "Entregaste y aprobaste la tarea/asignación del curso" : "Entrega y aprueba la tarea/asignación del curso",
        done: Boolean(gradedAssignment),
      });
    }
    // "Si no responde [las estrellas] el curso no se podrá dar por
    // finalizado y el certificado no se podrá emitir" — se muestra como un
    // requisito más, igual que el resto (ver CertificateService.checkAndIssueIfEligible).
    // Depende de que TODO lo demás ya esté cumplido — no tiene sentido
    // pedir calificar un curso a medias.
    const ratingRequired = !rating;
    const readyForRatingPrompt = ratingRequired && checklist.every((c) => c.done);
    checklist.push({ label: "Califica el curso con estrellas y un comentario", done: !ratingRequired });
    const missing = checklist.filter((c) => !c.done).map((c) => c.label);
    return { missing, checklist, ratingRequired, readyForRatingPrompt };
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

    // "Solo un certificado por curso, por más que lo lleve varias veces" —
    // un retake no emite un certificado NUEVO (ver CertificateService.
    // checkAndIssueIfEligible), así que `e.certificate` (la relación 1:1 de
    // ESTA matrícula puntual) queda null ahí aunque el alumno SÍ tenga uno
    // de una matrícula anterior al mismo curso — se resuelve por
    // (usuario, curso) en vez de por matrícula.
    const certifiedCourseIds = new Set(
      (
        await this.prisma.certificate.findMany({
          where: { userId, revoked: false, courseId: { in: enrollments.map((e) => e.courseId).filter((id): id is string => Boolean(id)) } },
          select: { courseId: true },
        })
      ).map((c) => c.courseId),
    );

    return Promise.all(
      enrollments.map(async (e) => {
        const offering = e.course ?? e.program;
        const approval =
          e.offeringKind === "COURSE" && e.courseId
            ? await this.computeApprovalMissing(e.courseId, e.id)
            : { missing: [], checklist: [], ratingRequired: false, readyForRatingPrompt: false };
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
          // "Que el alumno vea bonito cada curso... con su imagen" — antes
          // solo se resolvía para offeringKind COURSE; un programa/diplomado
          // matriculado se quedaba siempre sin portada aunque sí tuviera una
          // configurada.
          coverImageUrl: e.course?.coverImageAssetId
            ? this.storage.getPublicUrl(e.course.coverImageAssetId)
            : e.program?.coverImageAssetId
              ? this.storage.getPublicUrl(e.program.coverImageAssetId)
              : null,
          progressPct: e.progressPct,
          status: e.status,
          source: e.source,
          accessExpiresAt: e.accessExpiresAt?.toISOString() ?? null,
          nextActionLabel,
          certificateAvailable: Boolean((e.certificate && !e.certificate.revoked) || (e.courseId && certifiedCourseIds.has(e.courseId))),
          approvalMissing: approval.missing,
          readyForRatingPrompt: approval.readyForRatingPrompt,
          enrolledAt: e.enrolledAt.toISOString(),
        };
      }),
    );
  }

  /**
   * "Si vuelves a llevar el curso es gratis" — un alumno que ya terminó un
   * curso puede retomarlo sin pasar por checkout: se crea una matrícula
   * nueva (source=FREE, sin companyId aunque la original haya sido un cupo
   * B2B — el reintento es gratis para el alumno, no consume cupos de nadie)
   * con su propio progreso/intentos desde cero. El acotado de intentos de
   * examen a `enrollmentId` (ver AssessmentService.createAttempt) es lo que
   * hace que esta matrícula nueva arranque con intentos frescos.
   */
  async retakeCourse(userId: string, enrollmentId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { course: true },
    });
    if (!enrollment || enrollment.userId !== userId) {
      throw new NotFoundException("Matrícula no encontrada");
    }
    if (enrollment.offeringKind !== "COURSE" || !enrollment.course) {
      throw new ForbiddenException("Solo se puede volver a llevar un curso");
    }
    if (enrollment.status !== "COMPLETED") {
      throw new ForbiddenException("Solo puedes volver a llevar un curso que ya terminaste");
    }
    const alreadyRetaking = await this.prisma.enrollment.findFirst({
      where: { userId, courseId: enrollment.courseId, status: "ACTIVE" },
    });
    if (alreadyRetaking) {
      throw new BadRequestException("Ya tienes una matrícula activa en este curso");
    }

    const accessExpiresAt = computeAccessExpiresAt(enrollment.course.accessDurationPolicy, new Date());
    const retake = await this.prisma.enrollment.create({
      data: {
        userId,
        offeringKind: "COURSE",
        courseId: enrollment.courseId,
        source: "FREE",
        accessExpiresAt,
      },
    });
    await this.calendarService.scheduleForEnrollment(userId, enrollment.course, accessExpiresAt);
    await this.recomputeProgress(retake.id, enrollment.courseId!, userId);

    return { enrollmentId: retake.id };
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
            // "No puedo entrar al curso... para completar lo que me falta" —
            // el bug real: un diplomado/curso con VARIOS exámenes ponderados
            // (ver weightPercent) solo exponía uno solo acá (`take: 1`), así
            // que el resto (p.ej. un segundo examen que pesa 90% de la nota)
            // quedaba con nota 0 en la ponderación PARA SIEMPRE — no había
            // ningún link en el aula para siquiera rendirlo. Ahora se listan
            // todas las evaluaciones reales (no archivadas) del curso.
            assessments: {
              where: { archived: false, OR: [{ questions: { some: {} } }, { sourceFileAssetId: { not: null } }] },
              // "¿Cómo sabe el orden de los exámenes?" — antes ordenaba por
              // `id` (UUID, sin ningún significado). Ahora usa el orden real
              // de autoría, reordenable por arrastre (AssessmentService.reorderAssessments).
              orderBy: { order: "asc" },
              include: { attempts: { where: { enrollmentId, score: { not: null } }, orderBy: { score: "desc" }, take: 1 } },
            },
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
      scormEntryPath?: string | null;
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
      // kind="scorm": el material puede existir ANTES de que se suba/arme el
      // paquete (mismo flujo que una lección SCORM vacía) — sin esto, el
      // botón de "abrir" del Aula fallaría recién al hacer clic.
      scormReady: m.kind === "scorm" ? Boolean(m.scormEntryPath) : undefined,
    });

    const approval =
      enrollment.offeringKind === "COURSE" && enrollment.courseId && !accessBlocked
        ? await this.computeApprovalMissing(enrollment.courseId, enrollment.id)
        : { missing: [], checklist: [], ratingRequired: false, readyForRatingPrompt: false };
    // Mismo criterio cross-matrícula que computeApprovalMissing — si ya
    // calificó este curso en un intento anterior, se sigue mostrando esa
    // calificación acá (no hay una segunda que pedir).
    const myRating =
      enrollment.offeringKind === "COURSE" && enrollment.courseId
        ? await this.prisma.courseRating.findFirst({ where: { enrollment: { userId: enrollment.userId, courseId: enrollment.courseId } } })
        : null;

    // "No puedo entrar al curso... para completar lo que me falta" — lista
    // completa de evaluaciones (no solo la primera, ver comentario arriba
    // en el include), cada una con su propio candado y la mejor nota que ya
    // tiene el alumno, para poder navegar directo a la que le falta rendir
    // sin adivinar. Mismo criterio de conteo por ciclo que
    // AssessmentService.getForStudent (attemptCycleWhere).
    // "¿Cómo sabe cuál examen tomar en cada módulo?" — antes había un solo
    // candado global (assessmentsUnlocked, 100% del curso) para TODOS los
    // exámenes. Ahora cada examen trae su propio `unlocked`: si está
    // vinculado a un módulo (moduleId), se desbloquea apenas ESE módulo
    // está completo; si no (examen final del curso), sigue exigiendo el
    // curso completo — mismo criterio que AssessmentService.createAttempt.
    const assessments = accessBlocked
      ? []
      : await Promise.all(
          (enrollment.course?.assessments ?? []).map(async (a) => ({
            id: a.id,
            title: a.title as Record<string, string>,
            moduleId: a.moduleId,
            weightPercent: a.weightPercent ?? null,
            minScore: a.minScore,
            maxAttempts: a.maxAttempts,
            bestScore: a.attempts[0]?.score ?? null,
            unlocked: a.moduleId ? await this.isModuleComplete(a.moduleId, enrollment.id) : enrollment.progressPct >= 100,
            attemptsUsed: await this.prisma.assessmentAttempt.count({
              where: {
                assessmentId: a.id,
                enrollmentId: enrollment.id,
                ...(enrollment.materialResetAt ? { startedAt: { gte: enrollment.materialResetAt } } : {}),
              },
            }),
          })),
        );

    // Cross-matrícula, mismo criterio que listMine — "solo un certificado
    // por curso" significa que un retake sin certificado PROPIO igual debe
    // mostrar "Ver certificado" si ya tiene uno de una matrícula anterior
    // al mismo curso. Se resuelve UNA vez acá y se deriva certificateUrl
    // del mismo registro — antes certificateAvailable hacía su propia
    // consulta sin exponer a dónde descargar el PDF (el banner de
    // "Certificado" del aula necesita el link directo, no solo el booleano).
    const activeCertificate =
      enrollment.certificate && !enrollment.certificate.revoked
        ? enrollment.certificate
        : enrollment.courseId
          ? await this.prisma.certificate.findFirst({ where: { userId: enrollment.userId, courseId: enrollment.courseId, revoked: false } })
          : null;

    return {
      enrollmentId: enrollment.id,
      offeringKind: enrollment.offeringKind,
      status: enrollment.status,
      source: enrollment.source,
      progressPct: enrollment.progressPct,
      accessExpiresAt: enrollment.accessExpiresAt?.toISOString() ?? null,
      accessBlocked,
      certificateAvailable: Boolean(activeCertificate),
      certificateUrl: activeCertificate?.pdfAssetId ? this.storage.getPublicUrl(activeCertificate.pdfAssetId) : null,
      // Un curso puede no incluir certificación (Course.certificationIncluded)
      // — el banner "Certificado" del aula solo debe mostrarse si aplica,
      // para no prometer un certificado que este curso nunca va a emitir.
      certificationIncluded: enrollment.course?.certificationIncluded ?? false,
      courseId: enrollment.course?.id ?? enrollment.program?.id ?? null,
      title: (enrollment.course?.title as Record<string, string>) ?? (enrollment.program?.title as Record<string, string>) ?? {},
      syllabusUrl: enrollment.course?.syllabusAssetId ? this.storage.getPublicUrl(enrollment.course.syllabusAssetId) : null,
      // Cada examen trae su propio `unlocked` (ver arriba) — ya no hay un
      // solo candado global para todos.
      assessments,
      // "El sistema no debe permitir que el usuario pueda descargar la
      // clase [principal]" — configurable por curso (Course.blockMainVideoDownload).
      blockMainVideoDownload: enrollment.course?.blockMainVideoDownload ?? true,
      approvalMissing: approval.missing,
      // "La página de curso organizada como secuencia de acción... cuando
      // algo está bloqueado lo dice explícitamente" — checklist con TODOS
      // los requisitos (cumplidos y pendientes), no solo lo que falta.
      approvalChecklist: approval.checklist,
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
                audioUrl: l.audioAssetId ? this.storage.getPublicUrl(l.audioAssetId) ?? undefined : undefined,
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
   *
   * Público (no solo privado de esta clase) porque también hay que
   * llamarlo justo al CREAR una matrícula nueva de curso (checkout, cupo
   * B2B, otorgado gratis, "volver a llevar") — ver CommerceService/
   * CompaniesService. Sin eso, un curso sin ningún módulo/lección (armado
   * solo con examen, p.ej.) se queda con progressPct=0 (el default del
   * esquema) PARA SIEMPRE, porque este método de otro modo solo se dispara
   * al marcar una lección/lectura, y ese curso no tiene ninguna que marcar
   * — el examen (que exige progressPct>=100 para desbloquearse) nunca le
   * aparecía al alumno.
   */
  /**
   * "¿Cómo sabe cuál examen tomar en cada módulo?" — un examen vinculado a
   * un módulo (Assessment.moduleId) se desbloquea apenas ESE módulo está
   * completo, no con el curso entero. Mismo criterio que recomputeProgress
   * usa para el curso completo (lección completada + material MAIN leído),
   * pero acotado a las lecciones/materiales de este módulo puntual — un
   * módulo sin contenido cuenta como completo (mismo criterio "vacío es
   * 100%" ya usado ahí).
   */
  async isModuleComplete(moduleId: string, enrollmentId: string): Promise<boolean> {
    const [totalLessons, completedLessons, totalMainMaterials, readMainMaterials] = await Promise.all([
      this.prisma.lesson.count({ where: { moduleId } }),
      this.prisma.lessonProgress.count({ where: { enrollmentId, completed: true, lesson: { moduleId } } }),
      this.prisma.material.count({ where: { category: "MAIN", visible: true, OR: [{ lessonId: { not: null }, lesson: { moduleId } }, { moduleId }] } }),
      this.prisma.materialProgress.count({
        where: { enrollmentId, material: { category: "MAIN", OR: [{ lessonId: { not: null }, lesson: { moduleId } }, { moduleId }] } },
      }),
    ]);
    const totalUnits = totalLessons + totalMainMaterials;
    const completedUnits = completedLessons + readMainMaterials;
    return totalUnits === 0 || completedUnits >= totalUnits;
  }

  async recomputeProgress(enrollmentId: string, courseId: string, userId: string) {
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
    // "Revisar el material" es una condición vacía si el curso no tiene
    // ningún módulo/lección (p.ej. un curso armado solo con examen) — antes
    // el avance quedaba trabado en 0% para siempre en ese caso, y como el
    // examen exige progressPct>=100 para desbloquearse (ver
    // getMineDetail.assessmentUnlocked), el examen nunca llegaba a
    // aparecerle al alumno.
    const progressPct = totalUnits > 0 ? Math.round((completedUnits / totalUnits) * 10000) / 100 : 100;

    await this.prisma.enrollment.update({ where: { id: enrollmentId }, data: { progressPct } });
    await this.refreshCompletionStatus(enrollmentId);
    const updated = await this.prisma.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });

    await this.certificateService.checkAndIssueIfEligible(updated.id);
    await this.recommendationQueue.add(
      RECOMMENDATION_JOBS.REGENERATE_FOR_USER,
      { userId },
      { removeOnComplete: true, removeOnFail: 50 },
    );

    // "Le he puesto que he leído el material obligatorio y no me ha
    // aparecido la pantalla para calificar" — el bug real no estaba acá
    // (readyForRatingPrompt ya se calculaba bien en el server), sino en que
    // el frontend (Classroom.tsx) nunca se enteraba: markMaterialRead solo
    // actualizaba progressPct en estado local, sin refrescar el `detail`
    // completo de donde sale el modal de calificación. Ahora esta misma
    // respuesta también lleva readyForRatingPrompt, para que el cliente
    // pueda abrir el modal sin necesitar un refetch de toda la página.
    const approval = updated.offeringKind === "COURSE" && updated.courseId ? await this.computeApprovalMissing(updated.courseId, updated.id) : null;

    return { progressPct: updated.progressPct, status: updated.status, readyForRatingPrompt: approval?.readyForRatingPrompt ?? false };
  }

  /**
   * "El % de avance no puede ser 100% [la matrícula no puede darse por
   * Completada] si el curso tiene exámenes y no han sido aprobados, por más
   * que ya se haya terminado de revisar el material" — antes COMPLETED solo
   * exigía progressPct>=100, ignorando examen/asistencia/calificación por
   * completo. Ahora exige TODO lo que ya exige el certificado (mismo
   * check, computeApprovalMissing): si falta algo, la matrícula sigue
   * ACTIVE aunque el material ya esté 100% visto.
   *
   * Público y separado de recomputeProgress porque también hay que
   * volver a evaluarlo cuando se califica un intento de examen — eso NO
   * cambia progressPct (que es solo material/lecciones), pero sí puede
   * ser lo último que faltaba para dar la matrícula por completada. Ver
   * AssessmentService.submitAttempt/submitFileAttempt/gradeAnswer.
   */
  async refreshCompletionStatus(enrollmentId: string): Promise<void> {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!enrollment || enrollment.status === "COMPLETED" || enrollment.offeringKind !== "COURSE" || !enrollment.courseId) {
      return;
    }
    const approval = await this.computeApprovalMissing(enrollment.courseId, enrollmentId);
    if (approval.missing.length === 0) {
      await this.prisma.enrollment.update({ where: { id: enrollmentId }, data: { status: "COMPLETED", completedAt: new Date() } });
    }
  }

  /**
   * "En un curso asincrónico, si no lo pasa después de los intentos tendrá
   * que volver a repasar todo el material de nuevo" — se llama cuando un
   * alumno agota los intentos de un examen sin aprobar (ver
   * AssessmentService.handleAttemptFailedIfExhausted). Borra el avance de
   * lecciones/lecturas de ESTA matrícula (no las respuestas/intentos ya
   * dados, que quedan como historial) y marca `materialResetAt` — de ahí
   * en adelante, el conteo de intentos usados solo mira attempts
   * posteriores a este momento (ver createAttempt), así que agotarlos otra
   * vez exige repasar todo de nuevo en vez de quedar bloqueado para
   * siempre o poder reintentar sin límite.
   *
   * Los exámenes no están ligados a un módulo específico (Assessment.
   * courseId, no moduleId) — hoy "repasar todo el material" es siempre a
   * nivel de CURSO completo; si en el futuro se agregan exámenes por
   * módulo, este método debería acotarse a las lecciones/lecturas de ese
   * módulo únicamente.
   */
  async resetMaterialForRetry(enrollmentId: string, courseId: string, userId: string): Promise<void> {
    await this.prisma.lessonProgress.updateMany({ where: { enrollmentId }, data: { completed: false } });
    await this.prisma.materialProgress.deleteMany({ where: { enrollmentId } });
    await this.prisma.enrollment.update({ where: { id: enrollmentId }, data: { materialResetAt: new Date() } });
    // Recalcula progressPct con la misma lógica de siempre (incluido el
    // caso "curso sin ningún módulo/lección cuenta como 100% de una vez" —
    // ver recomputeProgress) — no lo pisamos a mano acá.
    await this.recomputeProgress(enrollmentId, courseId, userId);
  }

  /**
   * "El administrador debería tener la facultad de resetear un avance a 0%
   * o ponerlo como 100% por si hubiera algún error que tiene que
   * solucionar con el alumno (en casos extremos)." — a propósito NO pisa
   * `progressPct` directamente: ese valor se RECALCULA en cada interacción
   * del alumno (recomputeProgress, a partir de LessonProgress/
   * MaterialProgress reales), así que un simple `UPDATE progressPct=100`
   * se revertiría solo apenas el alumno marcara cualquier lección — acá se
   * marcan/desmarcan de verdad los registros de avance reales, para que el
   * resultado sea estable. Esto NO fuerza notas de examen ni asistencia —
   * solo el avance de material; si a la evaluación le sigue faltando algo,
   * `computeApprovalMissing` lo sigue mostrando con normalidad.
   */
  async adminSetProgress(enrollmentId: string, target: "ZERO" | "FULL") {
    const enrollment = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!enrollment) throw new NotFoundException("Matrícula no encontrada");
    if (enrollment.offeringKind !== "COURSE" || !enrollment.courseId) {
      throw new ForbiddenException("Solo se puede reiniciar el avance de una matrícula de curso");
    }
    const courseId = enrollment.courseId;

    if (target === "ZERO") {
      await this.prisma.lessonProgress.updateMany({ where: { enrollmentId }, data: { completed: false } });
      await this.prisma.materialProgress.deleteMany({ where: { enrollmentId } });
    } else {
      const lessons = await this.prisma.lesson.findMany({ where: { module: { courseId } }, select: { id: true } });
      const mainMaterials = await this.prisma.material.findMany({
        where: { category: "MAIN", visible: true, OR: [{ lesson: { module: { courseId } } }, { module: { courseId } }] },
        select: { id: true },
      });
      await this.prisma.$transaction([
        ...lessons.map((l) =>
          this.prisma.lessonProgress.upsert({
            where: { enrollmentId_lessonId: { enrollmentId, lessonId: l.id } },
            create: { enrollmentId, lessonId: l.id, userId: enrollment.userId, completed: true },
            update: { completed: true },
          }),
        ),
        ...mainMaterials.map((m) =>
          this.prisma.materialProgress.upsert({
            where: { enrollmentId_materialId: { enrollmentId, materialId: m.id } },
            create: { enrollmentId, materialId: m.id, userId: enrollment.userId },
            update: {},
          }),
        ),
      ]);
    }
    return this.recomputeProgress(enrollmentId, courseId, enrollment.userId);
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
    // "La calificación con estrellas ya se da por realizada, no debería
    // repetirse en cada retake" — defensa en profundidad: el frontend ya no
    // debería mostrar el modal de nuevo (ver computeApprovalMissing/myRating
    // cross-matrícula arriba), pero si de todos modos llega este POST para
    // una matrícula que NO es donde vive la calificación original, no se
    // crea una segunda fila — se deja la original tal cual.
    const existingForCourse = await this.prisma.courseRating.findFirst({ where: { userId, courseId: enrollment.courseId } });
    if (existingForCourse && existingForCourse.enrollmentId !== enrollmentId) {
      await this.refreshCompletionStatus(enrollmentId);
      return { saved: true };
    }
    await this.prisma.courseRating.upsert({
      where: { enrollmentId },
      create: { enrollmentId, userId, courseId: enrollment.courseId, stars, comment: comment ?? null },
      update: { stars, comment: comment ?? null },
    });
    await this.certificateService.checkAndIssueIfEligible(enrollmentId);
    // La calificación suele ser lo ÚLTIMO que falta (material y examen ya
    // aprobados) — sin esto, la matrícula se quedaba ACTIVE para siempre
    // aunque ya cumpliera todo, porque nada más vuelve a evaluar el estado
    // después de calificar.
    await this.refreshCompletionStatus(enrollmentId);
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

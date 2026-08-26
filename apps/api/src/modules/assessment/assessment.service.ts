import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import type { PrismaClient, Question } from "@inkademy/db";
import type { AssessmentAttemptSubmission, AssessmentResultDTO } from "@inkademy/shared";
import { PRISMA } from "../../common/prisma/prisma.module";
import { QUEUE_NAMES, ASSESSMENT_EXPIRY_JOBS } from "../../common/queues/queue.constants";
import { CertificateService } from "../certificate/certificate.service";
import { StorageService } from "../../storage/storage.service";
import { EnrollmentService } from "../enrollment/enrollment.service";

// Margen sobre timeLimitMinutes antes de dar por abandonado un intento
// nunca enviado — mismo criterio que TIME_LIMIT_GRACE_SECONDS en
// submitAttempt (no penalizar la latencia de red del último tramo), pero
// acá se necesita en minutos para el delay del job.
const ABANDONED_ATTEMPT_GRACE_MINUTES = 1;

// Piso conservador de segundos por pregunta — asume que ni siquiera leer el
// enunciado y las opciones toma menos de esto. Por debajo de este mínimo
// total, combinado con una nota alta, se marca el intento como sospechoso
// (ver submitAttempt). Ajustable si en la práctica da falsos positivos.
const SECONDS_PER_QUESTION_FLOOR = 20;
const SUSPICIOUS_SCORE_THRESHOLD = 90;
// "El temporizador sigue corriendo en el servidor... verificar que no haya
// excedido la duración máxima al enviar las respuestas" — margen sobre
// timeLimitMinutes para no penalizar latencia de red normal del propio
// envío (el cliente ya auto-envía al llegar a 0, este margen es solo para
// el viaje de esa request, no para dar tiempo extra real de examen).
const TIME_LIMIT_GRACE_SECONDS = 30;

// "Si no lo pasa después de los intentos tendrá que volver a repasar todo
// el material de nuevo" — una vez que EnrollmentService.resetMaterialForRetry
// marca materialResetAt, los intentos de ANTES de ese momento ya no cuentan
// para el tope de maxAttempts (repasar todo de nuevo desbloquea intentos
// frescos) — ver createAttempt y los conteos de attemptsUsed devueltos al
// alumno.
function attemptCycleWhere(materialResetAt: Date | null) {
  return materialResetAt ? { startedAt: { gte: materialResetAt } } : {};
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function isObjective(type: Question["type"]) {
  return type === "SINGLE_CHOICE" || type === "MULTI_CHOICE" || type === "TRUE_FALSE" || type === "ORDERING";
}

function gradeObjective(question: Question, response: unknown): { isCorrect: boolean; score: number } {
  const correct = question.correctAnswer as unknown;
  let isCorrect = false;
  if (question.type === "MULTI_CHOICE") {
    const a = new Set(Array.isArray(response) ? response : []);
    const b = new Set(Array.isArray(correct) ? (correct as string[]) : []);
    isCorrect = a.size === b.size && [...a].every((v) => b.has(v as string));
  } else if (question.type === "ORDERING") {
    // A diferencia de MULTI_CHOICE (conjunto, sin importar el orden), acá
    // el ORDEN importa — el alumno debe reordenar las opciones exactamente
    // igual que `correctAnswer` (secuencia de ids).
    const a = Array.isArray(response) ? response : [];
    const b = Array.isArray(correct) ? correct : [];
    isCorrect = a.length === b.length && a.every((v, i) => v === b[i]);
  } else {
    isCorrect = JSON.stringify(response) === JSON.stringify(correct);
  }
  return { isCorrect, score: isCorrect ? question.points : 0 };
}

@Injectable()
export class AssessmentService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly certificateService: CertificateService,
    private readonly storageService: StorageService,
    private readonly enrollmentService: EnrollmentService,
    @InjectQueue(QUEUE_NAMES.ASSESSMENT_EXPIRY) private readonly assessmentExpiryQueue: Queue,
  ) {}

  /**
   * Preguntas para presentar al alumno, sin `correctAnswer`, respetando
   * orden/aleatoriedad configurados. Antes esta ruta no verificaba
   * matrícula/pertenencia en absoluto — cualquier usuario autenticado que
   * conociera el `assessmentId` (compartido por un compañero, visto en el
   * historial del navegador, etc.) podía ver el banco de preguntas
   * completo o descargar el archivo fuente de un examen "cualitativo" sin
   * estar matriculado en el curso (hallazgo de auditoría de seguridad).
   * ADMIN/SUPPORT y el/los TEACHER de ese curso (CourseStaff) no tienen
   * esta restricción — necesitan poder revisar/previsualizar la evaluación.
   */
  async getForStudent(assessmentId: string, userId: string, isPrivileged: boolean) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        questions: { orderBy: { order: "asc" } },
        course: { select: { title: true, examHeaderText: true, examFooterText: true, examInstructionsText: true } },
      },
    });
    if (!assessment) throw new NotFoundException("Evaluación no encontrada");
    // Archivado = oculto a los alumnos, igual que si no existiera — el
    // staff privilegiado SÍ puede seguir viéndolo (p.ej. para restaurarlo).
    if (assessment.archived && !isPrivileged) throw new NotFoundException("Evaluación no encontrada");

    const enrollment = await this.prisma.enrollment.findFirst({
      where: { userId, courseId: assessment.courseId, offeringKind: "COURSE" },
    });
    if (!isPrivileged) {
      const isStaff = await this.prisma.courseStaff.findFirst({ where: { courseId: assessment.courseId, userId } });
      if (!enrollment && !isStaff) throw new ForbiddenException("No estás matriculado en el curso de esta evaluación");
    }

    // "Pantalla previa con todo lo que necesita saber el alumno antes de
    // rendir el examen" — cabecera/pie/instrucciones resueltos (propios del
    // examen si los personalizó, si no la plantilla del curso), datos de la
    // oferta y cuántos intentos ya usó. Común a ambas modalidades (archivo/preguntas).
    const attemptsUsed = enrollment
      ? await this.prisma.assessmentAttempt.count({
          where: { assessmentId, userId, enrollmentId: enrollment.id, ...attemptCycleWhere(enrollment.materialResetAt) },
        })
      : 0;
    const common = {
      courseTitle: assessment.course.title,
      timeLimitMinutes: assessment.timeLimitMinutes,
      maxAttempts: assessment.maxAttempts,
      attemptsUsed,
      minScore: assessment.minScore,
      availableFrom: assessment.availableFrom,
      availableUntil: assessment.availableUntil,
      titleFontFamily: assessment.titleFontFamily,
      headerText: assessment.headerTextOverride ?? assessment.course.examHeaderText ?? null,
      footerText: assessment.footerTextOverride ?? assessment.course.examFooterText ?? null,
      instructionsText: assessment.instructionsOverride ?? assessment.course.examInstructionsText ?? null,
    };

    // Examen "cualitativo" — el alumno no ve preguntas, descarga el archivo
    // que subió el docente y luego sube su propia respuesta como archivo
    // (ver submitFileAttempt). No hay Question/Answer involucrados.
    if (assessment.sourceFileAssetId) {
      return {
        id: assessment.id,
        title: assessment.title,
        type: assessment.type,
        isFileUpload: true as const,
        sourceFileUrl: this.storageService.getPublicUrl(assessment.sourceFileAssetId),
        sourceFileMimeType: assessment.sourceFileMimeType,
        displayMode: assessment.displayMode,
        questions: [] as never[],
        ...common,
      };
    }

    let pool = assessment.questions;
    if (assessment.questionsPerAttempt && assessment.questionsPerAttempt < pool.length) {
      pool = shuffle(pool).slice(0, assessment.questionsPerAttempt);
    }
    if (assessment.questionOrder === "RANDOM") pool = shuffle(pool);

    const questions = pool.map((q) => {
      let options = q.options as { id: string; text: unknown }[] | null;
      // ORDERING siempre se baraja para mostrar al alumno — si no, vería las
      // opciones ya en el orden correcto y la pregunta no tendría sentido.
      if (options && (assessment.randomizeOptions || q.type === "ORDERING")) options = shuffle(options);
      return {
        id: q.id,
        type: q.type,
        text: q.text,
        options,
        points: q.points,
      };
    });

    return {
      id: assessment.id,
      title: assessment.title,
      type: assessment.type,
      isFileUpload: false as const,
      displayMode: assessment.displayMode,
      questions,
      ...common,
    };
  }

  async createAttempt(assessmentId: string, userId: string) {
    const assessment = await this.prisma.assessment.findUnique({ where: { id: assessmentId }, include: { questions: true } });
    if (!assessment) throw new NotFoundException("Evaluación no encontrada");
    if (assessment.archived) throw new ForbiddenException("Esta evaluación ya no está disponible");

    // "Si al grabar las preguntas el puntaje excede la nota máxima debe
    // aparecer una alerta... sino no va a poder usar ese examen en una
    // evaluación" — defensa en profundidad: el builder ya avisa y marca el
    // examen como "no usable" en la lista, pero esto bloquea de verdad que
    // un alumno empiece un intento mientras la suma de puntos siga > 100.
    if (!assessment.sourceFileAssetId) {
      const totalPoints = assessment.questions.reduce((sum, q) => sum + q.points, 0);
      if (totalPoints > 100.01) {
        throw new ForbiddenException("Este examen no está disponible todavía: el docente debe ajustar el puntaje de las preguntas.");
      }
    }

    const now = new Date();
    if (assessment.availableFrom && now < assessment.availableFrom) {
      throw new ForbiddenException("Esta evaluación todavía no está disponible");
    }
    if (assessment.availableUntil && now > assessment.availableUntil) {
      throw new ForbiddenException("Esta evaluación ya cerró");
    }

    const enrollment = await this.prisma.enrollment.findFirst({
      where: { userId, courseId: assessment.courseId, offeringKind: "COURSE" },
      orderBy: { enrolledAt: "desc" },
    });
    if (!enrollment) throw new ForbiddenException("No estás matriculado en el curso de esta evaluación");
    // "El examen solo lo visualizará el alumno una vez completado el curso"
    // — defensa en profundidad: el frontend ya oculta el acceso, pero esto
    // evita que alguien dispare el POST directo sin haber completado.
    if (enrollment.progressPct < 100) {
      throw new ForbiddenException("Completa el curso para poder presentar esta evaluación");
    }

    // "Solo me dejó hacer 2 de 3 intentos" — bug real: el runner del
    // alumno llama a este endpoint en un useEffect que se vuelve a
    // disparar en cada montaje (recargar la página, atrás del navegador,
    // reabrir la pestaña) — sin este resume, cada uno de esos remontajes
    // creaba un AssessmentAttempt IN_PROGRESS nuevo y quemaba un intento
    // por algo que el alumno nunca llegó a responder. Si ya hay uno sin
    // enviar, se retoma ESE en vez de crear otro.
    const existingInProgress = await this.prisma.assessmentAttempt.findFirst({
      where: { assessmentId, userId, enrollmentId: enrollment.id, status: "IN_PROGRESS" },
      orderBy: { startedAt: "desc" },
    });
    if (existingInProgress) return existingInProgress;

    // Acotado a ESTA matrícula (no a todas las del usuario para este
    // examen) — "si vuelves a llevar el curso es gratis" crea una
    // matrícula nueva; sin este acotado, un alumno que retoma el curso
    // seguiría topado por los intentos ya gastados en la matrícula
    // anterior, aunque esté "empezando de cero". También acotado al ciclo
    // actual (desde el último materialResetAt) — ver
    // handleAttemptFailedIfExhausted/EnrollmentService.resetMaterialForRetry.
    const attemptsCount = await this.prisma.assessmentAttempt.count({
      where: { assessmentId, userId, enrollmentId: enrollment.id, ...attemptCycleWhere(enrollment.materialResetAt) },
    });
    if (attemptsCount >= assessment.maxAttempts) {
      throw new ForbiddenException("Alcanzaste el número máximo de intentos");
    }

    let attempt;
    try {
      attempt = await this.prisma.assessmentAttempt.create({
        data: {
          assessmentId,
          enrollmentId: enrollment.id,
          userId,
          attemptNumber: attemptsCount + 1,
        },
      });
    } catch (err) {
      // Carrera real entre dos requests casi simultáneas (ambas pasaron el
      // chequeo de arriba antes de que la primera terminara de crear el
      // suyo) — el índice único parcial de la migración
      // 20260826220000_attempt_in_progress_unique es lo que la detecta acá.
      // La que pierde la carrera simplemente retoma la que ganó, en vez de
      // fallar con un error que el alumno no esperaba.
      if ((err as { code?: string })?.code === "P2002") {
        const winner = await this.prisma.assessmentAttempt.findFirst({
          where: { assessmentId, userId, enrollmentId: enrollment.id, status: "IN_PROGRESS" },
          orderBy: { startedAt: "desc" },
        });
        if (winner) return winner;
      }
      throw err;
    }

    // "Si un alumno simplemente abandona, pero si el tiempo concluye
    // cambia su estado a culminado — expiración automática" — se programa
    // UNA vez, al crear el intento (no en cada request), para el momento
    // exacto en que se agota su propio tiempo. Si el alumno SÍ lo envía a
    // tiempo, el job igual se dispara más tarde pero no hace nada (ver
    // processor: solo actúa si sigue IN_PROGRESS).
    if (assessment.timeLimitMinutes) {
      await this.assessmentExpiryQueue.add(
        ASSESSMENT_EXPIRY_JOBS.EXPIRE_ATTEMPT,
        { attemptId: attempt.id },
        {
          delay: (assessment.timeLimitMinutes + ABANDONED_ATTEMPT_GRACE_MINUTES) * 60_000,
          attempts: 2,
          removeOnComplete: true,
          removeOnFail: 50,
        },
      );
    }

    return attempt;
  }

  async submitAttempt(
    attemptId: string,
    userId: string,
    input: AssessmentAttemptSubmission,
  ): Promise<AssessmentResultDTO> {
    const attempt = await this.prisma.assessmentAttempt.findUnique({
      where: { id: attemptId },
      include: { assessment: true },
    });
    if (!attempt) throw new NotFoundException("Intento no encontrado");
    if (attempt.userId !== userId) throw new ForbiddenException("No puedes enviar el intento de otro usuario");
    if (attempt.status !== "IN_PROGRESS") throw new BadRequestException("Este intento ya fue enviado");

    const questionIds = input.answers.map((a) => a.questionId);
    const questions = await this.prisma.question.findMany({ where: { id: { in: questionIds } } });
    const questionById = new Map(questions.map((q) => [q.id, q]));

    let pendingReviewCount = 0;
    for (const answer of input.answers) {
      const question = questionById.get(answer.questionId);
      if (!question) continue;

      let isCorrect: boolean | null = null;
      let score: number | null = null;
      if (isObjective(question.type)) {
        const graded = gradeObjective(question, answer.response);
        isCorrect = graded.isCorrect;
        score = graded.score;
      } else {
        // SHORT_ANSWER / OPEN: quedan pendientes de revisión manual (cola pending_review).
        pendingReviewCount += 1;
      }

      await this.prisma.answer.upsert({
        where: { attemptId_questionId: { attemptId, questionId: answer.questionId } },
        create: {
          attemptId,
          questionId: answer.questionId,
          response: answer.response as object,
          isCorrect,
          score,
        },
        update: { response: answer.response as object, isCorrect, score },
      });
    }

    const allAnswers = await this.prisma.answer.findMany({ where: { attemptId } });
    const stillPending = allAnswers.some((a) => a.isCorrect === null);

    let status: "PENDING_REVIEW" | "PASSED" | "FAILED" = "PENDING_REVIEW";
    let finalScore: number | null = null;
    if (!stillPending) {
      const maxPoints = questions.reduce((sum, q) => sum + q.points, 0) || 1;
      const earned = allAnswers.reduce((sum, a) => sum + (a.score ?? 0), 0);
      finalScore = Math.round((earned / maxPoints) * 10000) / 100;
      status = finalScore >= attempt.assessment.minScore ? "PASSED" : "FAILED";
    }

    const submittedAt = new Date();
    const durationSeconds = Math.max(0, Math.round((submittedAt.getTime() - attempt.startedAt.getTime()) / 1000));
    // Alerta heurística de posible trampa/uso de IA: nota alta + tiempo de
    // resolución muy por debajo del mínimo razonable para leer y pensar cada
    // pregunta (SECONDS_PER_QUESTION_FLOOR). No es una acusación ni bloquea
    // nada — solo marca el intento para que el admin/la empresa lo revisen
    // (ver CompaniesService.getReports y /admin/evaluaciones-pendientes).
    const expectedMinSeconds = questions.length * SECONDS_PER_QUESTION_FLOOR;
    const flaggedSuspicious =
      status === "PASSED" && finalScore !== null && finalScore >= SUSPICIOUS_SCORE_THRESHOLD && durationSeconds < expectedMinSeconds;

    // "Verificar que no haya excedido la duración máxima al enviar las
    // respuestas" — durationSeconds es real (startedAt server-side), así
    // que ni cerrar la pestaña ni desconectarse lo esquiva. Superado el
    // límite (con margen de red), el intento nunca puede quedar PASSED, sin
    // importar qué tan buenas fueran las respuestas.
    const timeLimitSeconds = attempt.assessment.timeLimitMinutes ? attempt.assessment.timeLimitMinutes * 60 : null;
    const timedOut = timeLimitSeconds !== null && durationSeconds > timeLimitSeconds + TIME_LIMIT_GRACE_SECONDS;
    if (timedOut && status === "PASSED") status = "FAILED";

    const updated = await this.prisma.assessmentAttempt.update({
      where: { id: attemptId },
      data: { submittedAt, score: finalScore, status, durationSeconds, flaggedSuspicious, timedOut },
    });

    if (!stillPending) {
      await this.certificateService.checkAndIssueIfEligible(attempt.enrollmentId);
      // "Los exámenes solo deben poderse dar una vez revisado el material...
      // el % de avance no puede ser 100% si hay exámenes sin completar" —
      // esto es lo que ahora hace que aprobar un examen (o que un docente
      // califique uno) pueda ser lo último que faltaba para que la
      // matrícula pase a COMPLETED, sin depender de que el alumno además
      // marque alguna lección/lectura (que puede no existir, ver
      // recomputeProgress).
      await this.enrollmentService.refreshCompletionStatus(attempt.enrollmentId);
    }

    const { attemptsUsed, materialReset } = await this.handleAttemptResolved(
      { assessmentId: attempt.assessmentId, enrollmentId: attempt.enrollmentId, userId },
      attempt.assessment.courseId,
      attempt.assessment.maxAttempts,
      status,
    );

    return {
      attemptId: updated.id,
      score: updated.score,
      status: updated.status,
      pendingReviewCount: allAnswers.filter((a) => a.isCorrect === null).length,
      attemptsUsed,
      maxAttempts: attempt.assessment.maxAttempts,
      timedOut,
      materialReset,
    };
  }

  /**
   * Sube el archivo de respuesta de un examen "cualitativo" — a diferencia
   * de `/admin/uploads` (solo ADMIN/TEACHER), este endpoint lo usa
   * cualquier alumno autenticado para subir SU propia respuesta. El
   * `assetId` devuelto se manda luego a `submitFileAttempt`.
   */
  async uploadSubmissionFile(file: { originalname: string; buffer: Buffer; mimetype: string }) {
    const key = `attempt-submissions/${randomUUID()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await this.storageService.uploadBuffer(key, file.buffer, file.mimetype);
    return { assetId: key, mimeType: file.mimetype };
  }

  /**
   * Envío de un examen "cualitativo" — el alumno sube un archivo (Word/
   * Excel/PPT/imagen/PDF) como respuesta completa, en vez de contestar
   * preguntas. Queda PENDING_REVIEW hasta que el docente lo califique a
   * mano viendo el archivo (ver gradeFileAttempt / listPendingFileReviews).
   */
  async submitFileAttempt(
    attemptId: string,
    userId: string,
    input: { submissionAssetId: string; submissionMimeType: string },
  ): Promise<AssessmentResultDTO> {
    const attempt = await this.prisma.assessmentAttempt.findUnique({ where: { id: attemptId }, include: { assessment: true } });
    if (!attempt) throw new NotFoundException("Intento no encontrado");
    if (attempt.userId !== userId) throw new ForbiddenException("No puedes enviar el intento de otro usuario");
    if (attempt.status !== "IN_PROGRESS") throw new BadRequestException("Este intento ya fue enviado");
    if (!attempt.assessment.sourceFileAssetId) throw new BadRequestException("Esta evaluación no es de tipo archivo");

    const submittedAt = new Date();
    const durationSeconds = Math.max(0, Math.round((submittedAt.getTime() - attempt.startedAt.getTime()) / 1000));
    const timeLimitSeconds = attempt.assessment.timeLimitMinutes ? attempt.assessment.timeLimitMinutes * 60 : null;
    const timedOut = timeLimitSeconds !== null && durationSeconds > timeLimitSeconds + TIME_LIMIT_GRACE_SECONDS;
    const updated = await this.prisma.assessmentAttempt.update({
      where: { id: attemptId },
      data: {
        submittedAt,
        durationSeconds,
        status: "PENDING_REVIEW",
        submissionAssetId: input.submissionAssetId,
        submissionMimeType: input.submissionMimeType,
        timedOut,
      },
    });

    const enrollmentForCycle = await this.prisma.enrollment.findUnique({
      where: { id: attempt.enrollmentId },
      select: { materialResetAt: true },
    });
    const attemptsUsed = await this.prisma.assessmentAttempt.count({
      where: {
        assessmentId: attempt.assessmentId,
        userId,
        enrollmentId: attempt.enrollmentId,
        ...attemptCycleWhere(enrollmentForCycle?.materialResetAt ?? null),
      },
    });

    return {
      attemptId: updated.id,
      score: null,
      status: updated.status,
      pendingReviewCount: 1,
      attemptsUsed,
      maxAttempts: attempt.assessment.maxAttempts,
      timedOut,
      materialReset: false,
    };
  }

  /**
   * El docente califica el archivo completo de un intento "cualitativo" —
   * a diferencia de `gradeAnswer` (una respuesta abierta puntual), acá se
   * califica el intento entero de una sola vez porque no hay preguntas
   * individuales que sumar.
   */
  async gradeFileAttempt(attemptId: string, graderId: string, input: { score: number; passed: boolean }, teacherUserId?: string) {
    const attempt = await this.prisma.assessmentAttempt.findUnique({ where: { id: attemptId }, include: { assessment: true } });
    if (!attempt) throw new NotFoundException("Intento no encontrado");
    // Hallazgo de seguridad: antes cualquier TEACHER autenticado podía
    // calificar (y así emitir certificado para) el intento de CUALQUIER
    // curso con solo conocer el attemptId — sin verificar que fuera
    // CourseStaff del curso dueño. Mismo patrón que assertTeacherOwnsAssessment.
    if (teacherUserId) await this.assertTeacherOwnsAssessment(attempt.assessmentId, teacherUserId);
    if (!attempt.assessment.sourceFileAssetId) throw new BadRequestException("Esta evaluación no es de tipo archivo");
    if (!attempt.submissionAssetId) throw new BadRequestException("El alumno todavía no subió su archivo de respuesta");

    await this.prisma.assessmentAttempt.update({
      where: { id: attemptId },
      data: { score: input.score, status: input.passed ? "PASSED" : "FAILED" },
    });

    if (input.passed) {
      await this.certificateService.checkAndIssueIfEligible(attempt.enrollmentId);
      // "Los exámenes solo deben poderse dar una vez revisado el material...
      // el % de avance no puede ser 100% si hay exámenes sin completar" —
      // esto es lo que ahora hace que aprobar un examen (o que un docente
      // califique uno) pueda ser lo último que faltaba para que la
      // matrícula pase a COMPLETED, sin depender de que el alumno además
      // marque alguna lección/lectura (que puede no existir, ver
      // recomputeProgress).
      await this.enrollmentService.refreshCompletionStatus(attempt.enrollmentId);
    }
    const { materialReset } = await this.handleAttemptResolved(
      { assessmentId: attempt.assessmentId, enrollmentId: attempt.enrollmentId, userId: attempt.userId },
      attempt.assessment.courseId,
      attempt.assessment.maxAttempts,
      input.passed ? "PASSED" : "FAILED",
    );
    return { graded: true, materialReset };
  }

  /**
   * Cola de exámenes "cualitativos" (archivo) pendientes de calificar —
   * espejo de `listPendingReview` (preguntas abiertas) pero para intentos
   * completos con archivo subido. `daysSincePending` es lo que el admin
   * usa para monitorear atraso por docente (ver listTeacherGradingWorkload).
   */
  async listPendingFileReviews(teacherUserId?: string) {
    const rows = await this.prisma.assessmentAttempt.findMany({
      where: {
        status: "PENDING_REVIEW",
        assessment: { sourceFileAssetId: { not: null } },
        ...(teacherUserId ? { assessment: { course: { staff: { some: { userId: teacherUserId } } } } } : {}),
      },
      include: { user: true, assessment: { include: { course: true } } },
      orderBy: { submittedAt: "asc" },
    });
    const now = Date.now();
    return rows.map((r) => ({
      attemptId: r.id,
      userId: r.userId,
      userName: `${r.user.firstName} ${r.user.lastName}`,
      assessmentId: r.assessmentId,
      assessmentTitle: r.assessment.title,
      courseId: r.assessment.courseId,
      courseTitle: r.assessment.course.title,
      submittedAt: r.submittedAt,
      daysSincePending: r.submittedAt ? Math.floor((now - r.submittedAt.getTime()) / 86_400_000) : 0,
      submissionUrl: r.submissionAssetId ? this.storageService.getPublicUrl(r.submissionAssetId) : null,
      submissionMimeType: r.submissionMimeType,
      sourceFileUrl: r.assessment.sourceFileAssetId ? this.storageService.getPublicUrl(r.assessment.sourceFileAssetId) : null,
    }));
  }

  /**
   * "El admin debe poder ver por cada docente: calificaciones pendientes,
   * días de atraso, y otros datos monitoreables" — agrega ambas colas
   * (preguntas abiertas + exámenes de archivo) por docente, usando la
   * fecha de envío del intento como referencia de "desde cuándo espera".
   * Solo tiene sentido para ADMIN/SUPPORT (vista cruzada de todos los
   * docentes) — un TEACHER ya ve su propia cola en /docente/evaluaciones-pendientes.
   */
  async listTeacherGradingWorkload() {
    const [pendingAnswers, pendingFileAttempts] = await Promise.all([
      this.prisma.answer.findMany({
        where: { isCorrect: null, question: { type: { in: ["OPEN", "SHORT_ANSWER"] } } },
        include: { attempt: { include: { assessment: { include: { course: { include: { staff: true } } } } } } },
      }),
      this.prisma.assessmentAttempt.findMany({
        where: { status: "PENDING_REVIEW", assessment: { sourceFileAssetId: { not: null } } },
        include: { assessment: { include: { course: { include: { staff: true } } } } },
      }),
    ]);

    const now = Date.now();
    interface Bucket {
      pendingOpenAnswers: number;
      pendingFileReviews: number;
      totalDelayDays: number;
      itemsWithDate: number;
      maxDelayDays: number;
    }
    const byTeacher = new Map<string, Bucket>();
    const addItem = (teacherId: string, submittedAt: Date | null, kind: "answer" | "file") => {
      const bucket: Bucket = byTeacher.get(teacherId) ?? { pendingOpenAnswers: 0, pendingFileReviews: 0, totalDelayDays: 0, itemsWithDate: 0, maxDelayDays: 0 };
      if (kind === "answer") bucket.pendingOpenAnswers += 1;
      else bucket.pendingFileReviews += 1;
      if (submittedAt) {
        const days = Math.max(0, (now - submittedAt.getTime()) / 86_400_000);
        bucket.totalDelayDays += days;
        bucket.itemsWithDate += 1;
        bucket.maxDelayDays = Math.max(bucket.maxDelayDays, days);
      }
      byTeacher.set(teacherId, bucket);
    };

    const teachingStaffIds = (staff: { userId: string; role: string }[]) =>
      staff.filter((s) => s.role === "TEACHER" || s.role === "CO_TEACHER").map((s) => s.userId);

    for (const a of pendingAnswers) {
      for (const teacherId of teachingStaffIds(a.attempt.assessment.course.staff)) addItem(teacherId, a.attempt.submittedAt, "answer");
    }
    for (const att of pendingFileAttempts) {
      for (const teacherId of teachingStaffIds(att.assessment.course.staff)) addItem(teacherId, att.submittedAt, "file");
    }

    const teacherIds = Array.from(byTeacher.keys());
    const teachers = await this.prisma.user.findMany({ where: { id: { in: teacherIds } }, select: { id: true, firstName: true, lastName: true } });
    const nameById = new Map(teachers.map((t) => [t.id, `${t.firstName} ${t.lastName}`]));

    return Array.from(byTeacher.entries())
      .map(([teacherId, b]) => ({
        teacherId,
        teacherName: nameById.get(teacherId) ?? "—",
        pendingOpenAnswers: b.pendingOpenAnswers,
        pendingFileReviews: b.pendingFileReviews,
        totalPending: b.pendingOpenAnswers + b.pendingFileReviews,
        avgDelayDays: b.itemsWithDate ? Math.round((b.totalDelayDays / b.itemsWithDate) * 10) / 10 : 0,
        maxDelayDays: Math.round(b.maxDelayDays * 10) / 10,
      }))
      .sort((a, b) => b.totalPending - a.totalPending);
  }

  async getAttempt(attemptId: string, userId: string, isPrivileged: boolean) {
    const attempt = await this.prisma.assessmentAttempt.findUnique({
      where: { id: attemptId },
      include: { answers: true, assessment: true },
    });
    if (!attempt) throw new NotFoundException("Intento no encontrado");
    if (!isPrivileged && attempt.userId !== userId) {
      throw new ForbiddenException("No puedes ver el intento de otro usuario");
    }

    // No exponer `correctAnswer` de las preguntas ni intentos de otros usuarios.
    return {
      id: attempt.id,
      assessmentId: attempt.assessmentId,
      attemptNumber: attempt.attemptNumber,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      score: attempt.score,
      status: attempt.status,
      isFileUpload: Boolean(attempt.assessment.sourceFileAssetId),
      submissionUrl: attempt.submissionAssetId ? this.storageService.getPublicUrl(attempt.submissionAssetId) : null,
      answers: attempt.answers.map((a) => ({
        questionId: a.questionId,
        response: a.response,
        isCorrect: a.isCorrect,
        score: a.score,
      })),
    };
  }

  // --- Usado por AdminModule ---

  /**
   * `teacherUserId` acota la cola a solo las respuestas de cursos donde ese
   * usuario es CourseStaff — usado cuando quien llama es TEACHER (ve solo
   * lo suyo, ver /docente/evaluaciones-pendientes); ADMIN/SUPPORT no manda
   * este parámetro y ve la cola completa (ver evaluaciones-pendientes admin).
   */
  async listPendingReview(teacherUserId?: string) {
    return this.prisma.answer.findMany({
      where: {
        isCorrect: null,
        question: { type: { in: ["OPEN", "SHORT_ANSWER"] } },
        ...(teacherUserId
          ? { attempt: { assessment: { course: { staff: { some: { userId: teacherUserId } } } } } }
          : {}),
      },
      include: {
        question: true,
        attempt: { include: { user: true, assessment: { include: { course: true } } } },
      },
      orderBy: { id: "asc" },
    });
  }

  /**
   * Intentos marcados como sospechosos (nota alta + tiempo de resolución muy
   * corto — ver submitAttempt) para que el admin/docente decida si amerita
   * revisión (no bloquea el certificado ni penaliza automáticamente).
   */
  async listSuspiciousAttempts(teacherUserId?: string) {
    return this.prisma.assessmentAttempt.findMany({
      where: {
        flaggedSuspicious: true,
        ...(teacherUserId ? { assessment: { course: { staff: { some: { userId: teacherUserId } } } } } : {}),
      },
      include: { user: true, assessment: { include: { course: true, questions: true } } },
      orderBy: { submittedAt: "desc" },
      take: 100,
    });
  }

  async gradeAnswer(
    attemptId: string,
    answerId: string,
    graderId: string,
    input: { score: number; isCorrect: boolean },
    teacherUserId?: string,
  ) {
    const answer = await this.prisma.answer.findUnique({ where: { id: answerId }, include: { attempt: true } });
    if (!answer || answer.attemptId !== attemptId) throw new NotFoundException("Respuesta no encontrada");
    // Mismo hallazgo que gradeFileAttempt: sin esto, cualquier TEACHER podía
    // calificar la respuesta de un examen de un curso ajeno.
    if (teacherUserId) await this.assertTeacherOwnsAssessment(answer.attempt.assessmentId, teacherUserId);

    await this.prisma.answer.update({
      where: { id: answerId },
      data: { score: input.score, isCorrect: input.isCorrect, gradedById: graderId, gradedAt: new Date() },
    });

    const attempt = await this.prisma.assessmentAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: { assessment: { include: { questions: true } }, answers: true },
    });
    const refreshedAnswers = await this.prisma.answer.findMany({ where: { attemptId } });
    const stillPending = refreshedAnswers.some((a) => a.isCorrect === null);

    if (!stillPending) {
      const maxPoints = attempt.assessment.questions.reduce((sum, q) => sum + q.points, 0) || 1;
      const earned = refreshedAnswers.reduce((sum, a) => sum + (a.score ?? 0), 0);
      const finalScore = Math.round((earned / maxPoints) * 10000) / 100;
      const status = finalScore >= attempt.assessment.minScore ? "PASSED" : "FAILED";
      await this.prisma.assessmentAttempt.update({
        where: { id: attemptId },
        data: { score: finalScore, status },
      });
      await this.certificateService.checkAndIssueIfEligible(attempt.enrollmentId);
      // "Los exámenes solo deben poderse dar una vez revisado el material...
      // el % de avance no puede ser 100% si hay exámenes sin completar" —
      // esto es lo que ahora hace que aprobar un examen (o que un docente
      // califique uno) pueda ser lo último que faltaba para que la
      // matrícula pase a COMPLETED, sin depender de que el alumno además
      // marque alguna lección/lectura (que puede no existir, ver
      // recomputeProgress).
      await this.enrollmentService.refreshCompletionStatus(attempt.enrollmentId);
      await this.handleAttemptResolved(
        { assessmentId: attempt.assessmentId, enrollmentId: attempt.enrollmentId, userId: attempt.userId },
        attempt.assessment.courseId,
        attempt.assessment.maxAttempts,
        status,
      );
    }

    return { graded: true };
  }

  /**
   * Cuenta los intentos usados en el ciclo actual (desde el último
   * materialResetAt, si lo hay) y, si el intento que acaba de resolverse
   * quedó FAILED y con eso se agotó el tope, dispara
   * EnrollmentService.resetMaterialForRetry — "si no lo pasa después de
   * los intentos, tendrá que volver a repasar todo el material de nuevo".
   * Compartido por submitAttempt, gradeFileAttempt y gradeAnswer (las 3
   * formas en que un intento puede terminar en FAILED).
   */
  private async handleAttemptResolved(
    attempt: { assessmentId: string; enrollmentId: string; userId: string },
    courseId: string,
    maxAttempts: number,
    status: "PASSED" | "FAILED" | "PENDING_REVIEW",
  ): Promise<{ attemptsUsed: number; materialReset: boolean }> {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: attempt.enrollmentId },
      select: { materialResetAt: true },
    });
    const attemptsUsed = await this.prisma.assessmentAttempt.count({
      where: {
        assessmentId: attempt.assessmentId,
        userId: attempt.userId,
        enrollmentId: attempt.enrollmentId,
        ...attemptCycleWhere(enrollment?.materialResetAt ?? null),
      },
    });
    let materialReset = false;
    if (status === "FAILED" && attemptsUsed >= maxAttempts) {
      await this.enrollmentService.resetMaterialForRetry(attempt.enrollmentId, courseId, attempt.userId);
      materialReset = true;
    }
    return { attemptsUsed, materialReset };
  }

  // ==========================================================================
  // Autoría de evaluaciones (crear/editar exámenes y preguntas) — antes no
  // existía NADA de esto: el estudiante podía presentar exámenes y el staff
  // podía calificar respuestas abiertas, pero la única forma de crear un
  // Assessment/Question era prisma/seed.ts. TEACHER solo puede autorear
  // evaluaciones de cursos donde es CourseStaff; ADMIN/SUPPORT (sin
  // teacherUserId) no tiene esa restricción.
  // ==========================================================================

  private async assertTeacherOwnsCourse(courseId: string, teacherUserId: string) {
    const membership = await this.prisma.courseStaff.findFirst({ where: { courseId, userId: teacherUserId } });
    if (!membership) throw new ForbiddenException("No tienes asignado este curso");
  }

  // "El administrador podría también bloquearle esos accesos" — mismo
  // criterio que AdminService.assertTeacherCanEditCourse, aplicado acá a
  // exámenes/preguntas: un docente con edición bloqueada sigue pudiendo
  // ver las evaluaciones de su curso (listForCourse), solo no crearlas/
  // modificarlas/borrarlas.
  private async assertTeacherCanEditCourse(courseId: string, teacherUserId: string) {
    const membership = await this.prisma.courseStaff.findFirst({ where: { courseId, userId: teacherUserId } });
    if (!membership) throw new ForbiddenException("No tienes asignado este curso");
    if (!membership.canEdit) throw new ForbiddenException("El administrador restringió tu acceso de edición a este curso");
  }

  private async assertTeacherOwnsAssessment(assessmentId: string, teacherUserId: string) {
    const assessment = await this.prisma.assessment.findUnique({ where: { id: assessmentId }, select: { courseId: true } });
    if (!assessment) throw new NotFoundException("Evaluación no encontrada");
    await this.assertTeacherCanEditCourse(assessment.courseId, teacherUserId);
  }

  async listForCourse(courseId: string, teacherUserId?: string, includeArchived = false) {
    if (teacherUserId) await this.assertTeacherOwnsCourse(courseId, teacherUserId);
    return this.prisma.assessment.findMany({
      where: { courseId, ...(includeArchived ? {} : { archived: false }) },
      include: { questions: { orderBy: { order: "asc" } }, _count: { select: { attempts: true } } },
      orderBy: { id: "asc" },
    });
  }

  async createAssessment(courseId: string, input: Record<string, unknown>, teacherUserId?: string) {
    if (teacherUserId) await this.assertTeacherCanEditCourse(courseId, teacherUserId);
    // "Si ya hay una regla de nota mínima para el certificado, no debería
    // repetirse cada vez que hago un examen" — un examen nuevo hereda por
    // defecto la nota mínima ya configurada a nivel curso (ApprovalRule),
    // en vez del 70 fijo del schema; sigue siendo un campo propio del
    // examen (Assessment.minScore) así que el docente puede cambiarlo para
    // ESE examen puntual sin afectar la regla del curso ni a los demás.
    let minScore = input.minScore;
    if (minScore === undefined) {
      const approvalRule = await this.prisma.approvalRule.findUnique({ where: { courseId }, select: { minScore: true } });
      if (approvalRule) minScore = approvalRule.minScore;
    }
    return this.prisma.assessment.create({ data: { courseId, ...input, ...(minScore !== undefined ? { minScore } : {}) } as never });
  }

  /**
   * "En% debe dar 100% o 1. No puede excederse" — si el guardado toca
   * weightPercent, se valida que la suma de TODOS los pesos del curso (sin
   * contar archivados, incluyendo el nuevo valor de este examen) no supere
   * 100. Que falte ponderar (<100) SÍ se permite — se arma un examen a la
   * vez; course-score.ts ya normaliza por el total real de todos modos, así
   * que esto es una validación de autoría, no un requisito del cálculo.
   */
  async updateAssessment(id: string, input: Record<string, unknown>, teacherUserId?: string) {
    if (teacherUserId) await this.assertTeacherOwnsAssessment(id, teacherUserId);
    if (Object.prototype.hasOwnProperty.call(input, "weightPercent")) {
      const current = await this.prisma.assessment.findUnique({ where: { id }, select: { courseId: true } });
      if (!current) throw new NotFoundException("Evaluación no encontrada");
      const others = await this.prisma.assessment.findMany({
        where: { courseId: current.courseId, archived: false, id: { not: id } },
        select: { weightPercent: true },
      });
      const othersSum = others.reduce((sum, a) => sum + (a.weightPercent ?? 0), 0);
      const newWeight = (input.weightPercent as number | null | undefined) ?? 0;
      if (othersSum + newWeight > 100.01) {
        throw new BadRequestException(
          `La suma de los pesos del curso superaría 100% (los demás exámenes ya suman ${othersSum}%, quedan ${Math.max(0, 100 - othersSum)}% disponibles).`,
        );
      }
    }
    return this.prisma.assessment.update({ where: { id }, data: input as never });
  }

  async deleteAssessment(id: string, teacherUserId?: string) {
    if (teacherUserId) await this.assertTeacherOwnsAssessment(id, teacherUserId);
    const attemptsCount = await this.prisma.assessmentAttempt.count({ where: { assessmentId: id } });
    if (attemptsCount > 0) {
      throw new BadRequestException("No se puede eliminar una evaluación con intentos de alumnos ya registrados");
    }
    await this.prisma.assessment.delete({ where: { id } });
    return { deleted: true };
  }

  async createQuestion(assessmentId: string, input: Record<string, unknown>, teacherUserId?: string) {
    if (teacherUserId) await this.assertTeacherOwnsAssessment(assessmentId, teacherUserId);
    // Se agrega al final por defecto — el orden real después lo controla el
    // drag-and-drop del builder (ver reorderQuestions).
    const last = await this.prisma.question.findFirst({ where: { assessmentId }, orderBy: { order: "desc" } });
    return this.prisma.question.create({ data: { assessmentId, order: (last?.order ?? -1) + 1, ...input } as never });
  }

  async updateQuestion(id: string, input: Record<string, unknown>, teacherUserId?: string) {
    const question = await this.prisma.question.findUnique({ where: { id } });
    if (!question) throw new NotFoundException("Pregunta no encontrada");
    if (teacherUserId && question.assessmentId) await this.assertTeacherOwnsAssessment(question.assessmentId, teacherUserId);
    return this.prisma.question.update({ where: { id }, data: input as never });
  }

  /** Drag-and-drop del builder — reemplaza el orden de TODAS las preguntas del examen según el array recibido. */
  async reorderQuestions(assessmentId: string, orderedQuestionIds: string[], teacherUserId?: string) {
    if (teacherUserId) await this.assertTeacherOwnsAssessment(assessmentId, teacherUserId);
    const existing = await this.prisma.question.findMany({ where: { assessmentId }, select: { id: true } });
    const existingIds = new Set(existing.map((q) => q.id));
    if (orderedQuestionIds.length !== existingIds.size || orderedQuestionIds.some((id) => !existingIds.has(id))) {
      throw new BadRequestException("La lista de preguntas no coincide con las preguntas reales de este examen");
    }
    await this.prisma.$transaction(
      orderedQuestionIds.map((id, index) => this.prisma.question.update({ where: { id }, data: { order: index } })),
    );
    return { reordered: true };
  }

  async deleteQuestion(id: string, teacherUserId?: string) {
    const question = await this.prisma.question.findUnique({ where: { id } });
    if (!question) throw new NotFoundException("Pregunta no encontrada");
    if (teacherUserId && question.assessmentId) await this.assertTeacherOwnsAssessment(question.assessmentId, teacherUserId);
    await this.prisma.question.delete({ where: { id } });
    return { deleted: true };
  }
}

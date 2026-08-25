import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PrismaClient, Question } from "@inkademy/db";
import type { AssessmentAttemptSubmission, AssessmentResultDTO } from "@inkademy/shared";
import { PRISMA } from "../../common/prisma/prisma.module";
import { CertificateService } from "../certificate/certificate.service";

// Piso conservador de segundos por pregunta — asume que ni siquiera leer el
// enunciado y las opciones toma menos de esto. Por debajo de este mínimo
// total, combinado con una nota alta, se marca el intento como sospechoso
// (ver submitAttempt). Ajustable si en la práctica da falsos positivos.
const SECONDS_PER_QUESTION_FLOOR = 20;
const SUSPICIOUS_SCORE_THRESHOLD = 90;

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
  ) {}

  /** Preguntas para presentar al alumno, sin `correctAnswer`, respetando orden/aleatoriedad configurados. */
  async getForStudent(assessmentId: string) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: { questions: true },
    });
    if (!assessment) throw new NotFoundException("Evaluación no encontrada");

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
      timeLimitMinutes: assessment.timeLimitMinutes,
      maxAttempts: assessment.maxAttempts,
      minScore: assessment.minScore,
      displayMode: assessment.displayMode,
      questions,
    };
  }

  async createAttempt(assessmentId: string, userId: string) {
    const assessment = await this.prisma.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) throw new NotFoundException("Evaluación no encontrada");

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

    const attemptsCount = await this.prisma.assessmentAttempt.count({ where: { assessmentId, userId } });
    if (attemptsCount >= assessment.maxAttempts) {
      throw new ForbiddenException("Alcanzaste el número máximo de intentos");
    }

    return this.prisma.assessmentAttempt.create({
      data: {
        assessmentId,
        enrollmentId: enrollment.id,
        userId,
        attemptNumber: attemptsCount + 1,
      },
    });
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

    const updated = await this.prisma.assessmentAttempt.update({
      where: { id: attemptId },
      data: { submittedAt, score: finalScore, status, durationSeconds, flaggedSuspicious },
    });

    if (!stillPending) {
      await this.certificateService.checkAndIssueIfEligible(attempt.enrollmentId);
    }

    return {
      attemptId: updated.id,
      score: updated.score,
      status: updated.status,
      pendingReviewCount: allAnswers.filter((a) => a.isCorrect === null).length,
    };
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

  async gradeAnswer(attemptId: string, answerId: string, graderId: string, input: { score: number; isCorrect: boolean }) {
    const answer = await this.prisma.answer.findUnique({ where: { id: answerId } });
    if (!answer || answer.attemptId !== attemptId) throw new NotFoundException("Respuesta no encontrada");

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
    }

    return { graded: true };
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

  private async assertTeacherOwnsAssessment(assessmentId: string, teacherUserId: string) {
    const assessment = await this.prisma.assessment.findUnique({ where: { id: assessmentId }, select: { courseId: true } });
    if (!assessment) throw new NotFoundException("Evaluación no encontrada");
    await this.assertTeacherOwnsCourse(assessment.courseId, teacherUserId);
  }

  async listForCourse(courseId: string, teacherUserId?: string) {
    if (teacherUserId) await this.assertTeacherOwnsCourse(courseId, teacherUserId);
    return this.prisma.assessment.findMany({
      where: { courseId },
      include: { questions: true, _count: { select: { attempts: true } } },
      orderBy: { id: "asc" },
    });
  }

  async createAssessment(courseId: string, input: Record<string, unknown>, teacherUserId?: string) {
    if (teacherUserId) await this.assertTeacherOwnsCourse(courseId, teacherUserId);
    return this.prisma.assessment.create({ data: { courseId, ...input } as never });
  }

  async updateAssessment(id: string, input: Record<string, unknown>, teacherUserId?: string) {
    if (teacherUserId) await this.assertTeacherOwnsAssessment(id, teacherUserId);
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
    return this.prisma.question.create({ data: { assessmentId, ...input } as never });
  }

  async updateQuestion(id: string, input: Record<string, unknown>, teacherUserId?: string) {
    const question = await this.prisma.question.findUnique({ where: { id } });
    if (!question) throw new NotFoundException("Pregunta no encontrada");
    if (teacherUserId && question.assessmentId) await this.assertTeacherOwnsAssessment(question.assessmentId, teacherUserId);
    return this.prisma.question.update({ where: { id }, data: input as never });
  }

  async deleteQuestion(id: string, teacherUserId?: string) {
    const question = await this.prisma.question.findUnique({ where: { id } });
    if (!question) throw new NotFoundException("Pregunta no encontrada");
    if (teacherUserId && question.assessmentId) await this.assertTeacherOwnsAssessment(question.assessmentId, teacherUserId);
    await this.prisma.question.delete({ where: { id } });
    return { deleted: true };
  }
}

import type { PrismaClient } from "@inkademy/db";

export interface CourseScoreResult {
  hasAssessments: boolean;
  finalScore: number | null;
}

interface ScorableAssessment {
  id: string;
  weightPercent: number | null;
  scormLessonId: string | null;
  scormMaterialId: string | null;
}

/**
 * "¿Cómo se calcula la nota si el examen vive DENTRO del SCORM?" — un
 * Assessment puede estar respaldado por un SCORM (scormLessonId/
 * scormMaterialId, ver prisma/schema.prisma) en vez de tener preguntas
 * propias; su puntaje no vive en AssessmentAttempt sino en
 * LessonProgress.scormScoreRaw / MaterialScormProgress.scormScoreRaw (el
 * único puntaje final que el paquete SCORM le reportó al LMS — si ese
 * paquete tiene varias secciones con peso propio, ya llega acá pre-
 * ponderado, ver packages/shared/scorm-authoring.ts). Un examen nativo
 * sigue resolviéndose contra AssessmentAttempt exactamente igual que
 * siempre.
 */
async function resolveBestScore(prisma: PrismaClient, enrollmentId: string, assessment: ScorableAssessment): Promise<number | null> {
  if (assessment.scormLessonId) {
    const progress = await prisma.lessonProgress.findUnique({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId: assessment.scormLessonId } },
    });
    return progress?.scormScoreRaw ?? null;
  }
  if (assessment.scormMaterialId) {
    const progress = await prisma.materialScormProgress.findUnique({
      where: { enrollmentId_materialId: { enrollmentId, materialId: assessment.scormMaterialId } },
    });
    return progress?.scormScoreRaw ?? null;
  }
  const best = await prisma.assessmentAttempt.findFirst({
    where: { enrollmentId, assessmentId: assessment.id, score: { not: null } },
    orderBy: { score: "desc" },
  });
  return best?.score ?? null;
}

/**
 * Nota final del alumno en el curso para efectos de habilitar el
 * certificado — usada tanto por CertificateService.checkAndIssueIfEligible
 * como por EnrollmentService.computeApprovalMissing, para que ambos
 * gates nunca queden desincronizados (ya pasó antes con el filtro de
 * "examen fantasma" — se corrigió en los dos lugares por separado).
 *
 * Dos modos, elegidos por ApprovalRule.scoreMode:
 * - BEST_ATTEMPT (default, compatible con cursos de un solo examen): la
 *   mejor nota entre TODOS los intentos de CUALQUIER evaluación real del
 *   curso.
 * - WEIGHTED_AVERAGE: "hay diplomados con varios exámenes y una fórmula de
 *   ponderación" — cada Assessment.weightPercent define su peso; la nota
 *   final es el promedio ponderado de la mejor nota de CADA evaluación con
 *   peso > 0 (una evaluación sin intentos todavía cuenta como 0, así el
 *   alumno no puede "saltarse" un examen del diplomado). Si el curso está
 *   en modo ponderado pero ningún Assessment tiene peso configurado
 *   (todavía no se armó la fórmula), cae al modo BEST_ATTEMPT para no
 *   bloquear certificados existentes por una fórmula a medio configurar.
 */
export async function computeCourseScore(
  prisma: PrismaClient,
  enrollmentId: string,
  courseId: string,
  scoreMode: string,
): Promise<CourseScoreResult> {
  const assessments = await prisma.assessment.findMany({
    where: {
      courseId,
      OR: [{ questions: { some: {} } }, { sourceFileAssetId: { not: null } }, { scormLessonId: { not: null } }, { scormMaterialId: { not: null } }],
    },
    select: { id: true, weightPercent: true, scormLessonId: true, scormMaterialId: true },
  });
  if (assessments.length === 0) return { hasAssessments: false, finalScore: null };

  const weighted = assessments.filter((a) => (a.weightPercent ?? 0) > 0);
  const useWeighted = scoreMode === "WEIGHTED_AVERAGE" && weighted.length > 0;

  if (!useWeighted) {
    // Antes una sola query de AssessmentAttempt bastaba para "la mejor nota
    // de cualquier evaluación real" — con exámenes SCORM-backed en la
    // mezcla, el puntaje puede vivir en otra tabla, así que hay que resolver
    // cada evaluación por separado y quedarse con el máximo.
    let best: number | null = null;
    for (const a of assessments) {
      const score = await resolveBestScore(prisma, enrollmentId, a);
      if (score !== null && (best === null || score > best)) best = score;
    }
    return { hasAssessments: true, finalScore: best };
  }

  const totalWeight = weighted.reduce((sum, a) => sum + (a.weightPercent ?? 0), 0);
  let weightedSum = 0;
  let anyAttempted = false;
  for (const a of weighted) {
    const best = await resolveBestScore(prisma, enrollmentId, a);
    if (best !== null) anyAttempted = true;
    weightedSum += (best ?? 0) * (a.weightPercent ?? 0);
  }
  return { hasAssessments: true, finalScore: anyAttempted && totalWeight > 0 ? weightedSum / totalWeight : null };
}

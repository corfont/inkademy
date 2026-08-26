import type { PrismaClient } from "@inkademy/db";

export interface CourseScoreResult {
  hasAssessments: boolean;
  finalScore: number | null;
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
    where: { courseId, OR: [{ questions: { some: {} } }, { sourceFileAssetId: { not: null } }] },
    select: { id: true, weightPercent: true },
  });
  if (assessments.length === 0) return { hasAssessments: false, finalScore: null };

  const weighted = assessments.filter((a) => (a.weightPercent ?? 0) > 0);
  const useWeighted = scoreMode === "WEIGHTED_AVERAGE" && weighted.length > 0;

  if (!useWeighted) {
    const bestAttempt = await prisma.assessmentAttempt.findFirst({
      where: { enrollmentId, score: { not: null } },
      orderBy: { score: "desc" },
    });
    return { hasAssessments: true, finalScore: bestAttempt?.score ?? null };
  }

  const totalWeight = weighted.reduce((sum, a) => sum + (a.weightPercent ?? 0), 0);
  let weightedSum = 0;
  let anyAttempted = false;
  for (const a of weighted) {
    const best = await prisma.assessmentAttempt.findFirst({
      where: { enrollmentId, assessmentId: a.id, score: { not: null } },
      orderBy: { score: "desc" },
    });
    if (best) anyAttempted = true;
    weightedSum += (best?.score ?? 0) * (a.weightPercent ?? 0);
  }
  return { hasAssessments: true, finalScore: anyAttempted && totalWeight > 0 ? weightedSum / totalWeight : null };
}

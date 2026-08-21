import type { Job } from "bullmq";
import { prisma } from "@inkademy/db";
import { WORKER_EMAIL_JOBS, type RegenerateRecommendationsJobData } from "../queues";
import { notifyByEmail } from "../lib/notify";
import { renderCourseRecommendation } from "../templates/email-templates";
import { createLogger } from "../lib/logger";

const logger = createLogger("recommendation.processor");

const LEVEL_ORDER = ["INITIAL", "INTERMEDIATE", "ADVANCED"] as const;

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

function pickEs(text: unknown): string {
  const t = text as Record<string, string> | null | undefined;
  return t?.es ?? t?.en ?? "";
}

interface NewRecommendation {
  courseId: string;
  title: string;
  slug: string;
}

async function alreadyHasAccess(userId: string, courseId: string): Promise<boolean> {
  const count = await prisma.enrollment.count({ where: { userId, courseId, status: { in: ["ACTIVE", "COMPLETED"] } } });
  return count > 0;
}

async function tryCreateCourseRecommendation(
  userId: string,
  courseId: string,
  reason: string,
  score: number,
  created: NewRecommendation[],
): Promise<void> {
  if (await alreadyHasAccess(userId, courseId)) return;
  const existing = await prisma.recommendation.findFirst({ where: { userId, courseId, reason, dismissed: false } });
  if (existing) return;
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || course.status !== "PUBLISHED") return;

  await prisma.recommendation.create({ data: { userId, courseId, reason, score } });
  created.push({ courseId, title: pickEs(course.title), slug: course.slug });
}

/**
 * Reglas (a) y (b): a partir de TODOS los cursos que el usuario ya completó,
 * sugiere: (a) el siguiente curso del mismo Program (o lo curado a mano en
 * `Course.nextRecommendedCourseIds`), y (b) un curso publicado de la misma
 * área con el siguiente nivel.
 */
async function applyCompletedCourseRules(userId: string, created: NewRecommendation[]): Promise<void> {
  const completed = await prisma.enrollment.findMany({
    where: { userId, status: "COMPLETED", offeringKind: "COURSE" },
    include: { course: true },
  });

  for (const enrollment of completed) {
    const course = enrollment.course;
    if (!course) continue;

    for (const nextId of course.nextRecommendedCourseIds) {
      await tryCreateCourseRecommendation(userId, nextId, "completed_related", 0.9, created);
    }

    const programCourse = await prisma.programCourse.findFirst({ where: { courseId: course.id } });
    if (programCourse) {
      const nextInProgram = await prisma.programCourse.findFirst({
        where: { programId: programCourse.programId, order: { gt: programCourse.order } },
        orderBy: { order: "asc" },
      });
      if (nextInProgram) {
        await tryCreateCourseRecommendation(userId, nextInProgram.courseId, "completed_related", 0.85, created);
      }
    }

    const currentLevelIdx = LEVEL_ORDER.indexOf(course.level);
    const nextLevel = LEVEL_ORDER[currentLevelIdx + 1];
    if (nextLevel) {
      const candidates = await prisma.course.findMany({
        where: { areaId: course.areaId, level: nextLevel, status: "PUBLISHED", id: { not: course.id } },
        take: 3,
      });
      for (const candidate of candidates) {
        await tryCreateCourseRecommendation(userId, candidate.id, "level_progression", 0.7, created);
      }
    }
  }
}

/**
 * Regla (c): asignación directa por una empresa. `apps/api` no encola un
 * job dedicado para esto (`CompaniesService.assignSeat` solo crea el
 * `Enrollment` con `source=B2B_SEAT`) — se deriva de ahí: toda matrícula
 * `B2B_SEAT` del usuario que todavía no tenga su `Recommendation`
 * `company_assigned` correspondiente, la genera.
 */
async function applyCompanyAssignedRule(userId: string, created: NewRecommendation[]): Promise<void> {
  const seatEnrollments = await prisma.enrollment.findMany({
    where: { userId, source: "B2B_SEAT" },
    include: { course: true },
  });

  for (const enrollment of seatEnrollments) {
    if (enrollment.courseId && enrollment.course) {
      const existing = await prisma.recommendation.findFirst({
        where: { userId, courseId: enrollment.courseId, reason: "company_assigned" },
      });
      if (!existing) {
        await prisma.recommendation.create({
          data: { userId, courseId: enrollment.courseId, reason: "company_assigned", score: 1 },
        });
        created.push({ courseId: enrollment.courseId, title: pickEs(enrollment.course.title), slug: enrollment.course.slug });
      }
    } else if (enrollment.programId) {
      const existing = await prisma.recommendation.findFirst({
        where: { userId, programId: enrollment.programId, reason: "company_assigned" },
      });
      if (!existing) {
        await prisma.recommendation.create({
          data: { userId, programId: enrollment.programId, reason: "company_assigned", score: 1 },
        });
      }
    }
  }
}

/**
 * `apps/api` encola esto (`RECOMMENDATION_JOBS.REGENERATE_FOR_USER`, solo
 * `{ userId }`) cada vez que cambia el progreso de una matrícula — así que
 * recalcula TODAS las reglas del usuario de punta a punta en vez de operar
 * sobre un curso puntual. Es idempotente (cada regla revisa si la
 * `Recommendation` ya existe antes de crearla), así que puede llegar
 * seguido sin problema. Solo envía el correo "course-recommendation" si
 * quedó al menos una recomendación nueva en esta corrida (para no
 * espamear en cada tick de progreso).
 */
export async function processRecommendationJob(job: Job<RegenerateRecommendationsJobData>): Promise<void> {
  const { userId } = job.data;
  const created: NewRecommendation[] = [];

  await applyCompletedCourseRules(userId, created);
  await applyCompanyAssignedRule(userId, created);

  if (created.length > 0) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      const top = created[0];
      const rendered = renderCourseRecommendation({
        firstName: user.firstName,
        courseTitle: top.title,
        courseUrl: `${appUrl()}/cursos/${top.slug}`,
      });
      await notifyByEmail({
        userId,
        to: user.email,
        template: WORKER_EMAIL_JOBS.COURSE_RECOMMENDATION,
        ...rendered,
      });
    }
  }

  logger.info("recomendaciones regeneradas", { userId, nuevas: created.length });
}

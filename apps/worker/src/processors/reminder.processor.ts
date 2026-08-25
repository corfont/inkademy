import type { Job } from "bullmq";
import { prisma } from "@inkademy/db";
import {
  REMINDER_JOBS,
  REMINDER_SWEEP_JOB,
  WORKER_EMAIL_JOBS,
  type LiveSessionUpcomingJobData,
  type CourseAccessExpiringJobData,
  type AssessmentDueJobData,
  type LiveSessionOffset,
  type DeadlineOffset,
} from "../queues";
import { reminderQueue } from "../lib/queue-client";
import { notifyByEmail } from "../lib/notify";
import { renderCourseStartReminder, renderLiveClassReminder, renderDeadlineReminder } from "../templates/email-templates";
import { createLogger } from "../lib/logger";

const logger = createLogger("reminder.processor");

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MIN_MS = 60 * 1000;

const LIVE_SESSION_OFFSET_MS: Record<LiveSessionOffset, number> = {
  "7d": 7 * DAY_MS,
  "24h": DAY_MS,
  "1h": HOUR_MS,
  "10min": 10 * MIN_MS,
};

const DEADLINE_OFFSET_MS: Record<DeadlineOffset, number> = {
  "3d": 3 * DAY_MS,
  "24h": DAY_MS,
};

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

function pickEs(text: unknown): string {
  const t = text as Record<string, string> | null | undefined;
  return t?.es ?? t?.en ?? "";
}

// ---------------------------------------------------------------------------
// Sweep: NO envía nada — solo decide qué recordatorios deben existir y los
// programa como delayed jobs en esta misma cola ("reminder"), con un jobId
// determinístico para que reintentar el sweep (corre cada
// SWEEP_INTERVAL_MS, ver src/index.ts) no duplique nada. BullMQ ignora un
// `add` con un `jobId` que ya está esperando/delayed en la cola.
// ---------------------------------------------------------------------------

async function scheduleLiveSessionOffset(liveSessionId: string, startsAt: Date, offset: LiveSessionOffset) {
  const delay = startsAt.getTime() - LIVE_SESSION_OFFSET_MS[offset] - Date.now();
  if (delay <= 0) return;
  await reminderQueue().add(
    REMINDER_JOBS.LIVE_SESSION_UPCOMING,
    { liveSessionId, offset } satisfies LiveSessionUpcomingJobData,
    { jobId: `${REMINDER_JOBS.LIVE_SESSION_UPCOMING}:${liveSessionId}:${offset}`, delay, removeOnComplete: true, removeOnFail: 200 },
  );
}

async function sweepLiveSessions(): Promise<void> {
  const courses = await prisma.course.findMany({
    where: { status: "PUBLISHED", modality: { in: ["LIVE", "HYBRID"] } },
    include: {
      liveSessions: { where: { status: "SCHEDULED", startsAt: { gt: new Date() } }, orderBy: { startsAt: "asc" } },
    },
  });

  for (const course of courses) {
    if (course.liveSessions.length === 0) continue;

    // "Inicio de curso" = la sesión en vivo más próxima del curso (7d/24h antes).
    const earliest = course.liveSessions[0];
    await scheduleLiveSessionOffset(earliest.id, earliest.startsAt, "7d");
    await scheduleLiveSessionOffset(earliest.id, earliest.startsAt, "24h");

    // Cada sesión en vivo, individualmente (1h/10min antes).
    for (const session of course.liveSessions) {
      await scheduleLiveSessionOffset(session.id, session.startsAt, "1h");
      await scheduleLiveSessionOffset(session.id, session.startsAt, "10min");
    }
  }
}

async function sweepAccessExpiring(): Promise<void> {
  const enrollments = await prisma.enrollment.findMany({
    where: { status: "ACTIVE", accessExpiresAt: { gt: new Date() } },
    select: { id: true, accessExpiresAt: true },
  });

  for (const enrollment of enrollments) {
    for (const offset of ["3d", "24h"] as const) {
      const delay = enrollment.accessExpiresAt!.getTime() - DEADLINE_OFFSET_MS[offset] - Date.now();
      if (delay <= 0) continue;
      await reminderQueue().add(
        REMINDER_JOBS.COURSE_ACCESS_EXPIRING,
        { enrollmentId: enrollment.id, offset } satisfies CourseAccessExpiringJobData,
        { jobId: `${REMINDER_JOBS.COURSE_ACCESS_EXPIRING}:${enrollment.id}:${offset}`, delay, removeOnComplete: true, removeOnFail: 200 },
      );
    }
  }
}

/**
 * El corte de acceso real ya lo hace la API en el momento (enrollment.service.ts
 * getMineDetail/updateLessonProgress comparan accessExpiresAt directo, no
 * dependen de este sweep) — esto solo mantiene `status` al día para que
 * reportes/exceptions/admin vean EXPIRED en vez de un ACTIVE ya vencido.
 */
async function sweepExpireAccess(): Promise<void> {
  const { count } = await prisma.enrollment.updateMany({
    where: { status: "ACTIVE", accessExpiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
  if (count > 0) logger.info("matrículas marcadas EXPIRED por vencimiento de acceso", { count });
}

async function sweepAssessmentDue(): Promise<void> {
  const assessments = await prisma.assessment.findMany({
    where: { availableUntil: { gt: new Date() } },
    select: { id: true, availableUntil: true, courseId: true },
  });

  for (const assessment of assessments) {
    const enrollments = await prisma.enrollment.findMany({
      where: { courseId: assessment.courseId, status: "ACTIVE" },
      select: { id: true },
    });
    for (const enrollment of enrollments) {
      for (const offset of ["3d", "24h"] as const) {
        const delay = assessment.availableUntil!.getTime() - DEADLINE_OFFSET_MS[offset] - Date.now();
        if (delay <= 0) continue;
        await reminderQueue().add(
          REMINDER_JOBS.ASSESSMENT_DUE,
          { assessmentId: assessment.id, enrollmentId: enrollment.id, offset } satisfies AssessmentDueJobData,
          {
            jobId: `${REMINDER_JOBS.ASSESSMENT_DUE}:${assessment.id}:${enrollment.id}:${offset}`,
            delay,
            removeOnComplete: true,
            removeOnFail: 200,
          },
        );
      }
    }
  }
}

async function runSweep(): Promise<void> {
  const results = await Promise.allSettled([sweepLiveSessions(), sweepAccessExpiring(), sweepExpireAccess(), sweepAssessmentDue()]);
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      logger.error("fallo una rama del sweep de recordatorios", { branch: i, err: String(r.reason) });
    }
  });
  logger.info("sweep de recordatorios completado");
}

// ---------------------------------------------------------------------------
// Envío real, cuando el delayed job programado arriba finalmente vence.
// ---------------------------------------------------------------------------

async function sendLiveSessionUpcoming(data: LiveSessionUpcomingJobData): Promise<void> {
  const session = await prisma.liveSession.findUnique({ where: { id: data.liveSessionId }, include: { course: true } });
  if (!session || session.status === "CANCELLED") return;

  const enrollments = await prisma.enrollment.findMany({
    where: { courseId: session.courseId, status: "ACTIVE" },
    include: { user: true },
  });
  const courseTitle = pickEs(session.course.title);
  const isCourseStart = data.offset === "7d" || data.offset === "24h";

  for (const enrollment of enrollments) {
    const rendered = isCourseStart
      ? renderCourseStartReminder(data.offset as "7d" | "24h", {
          firstName: enrollment.user.firstName,
          courseTitle,
          startsAt: session.startsAt.toLocaleString("es-PE"),
          courseUrl: `${appUrl()}/cursos/${session.course.slug}`,
        })
      : renderLiveClassReminder(data.offset as "1h" | "10min", {
          firstName: enrollment.user.firstName,
          courseTitle,
          startsAt: session.startsAt.toLocaleString("es-PE"),
          joinUrl: session.joinUrl ?? "",
        });

    await notifyByEmail({
      userId: enrollment.userId,
      to: enrollment.user.email,
      template: WORKER_EMAIL_JOBS.LIVE_SESSION_UPCOMING,
      ...rendered,
    });
  }
}

async function sendAccessExpiring(data: CourseAccessExpiringJobData): Promise<void> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: data.enrollmentId },
    include: { user: true, course: true },
  });
  if (!enrollment || enrollment.status !== "ACTIVE" || !enrollment.accessExpiresAt) return;

  const rendered = renderDeadlineReminder(data.offset, {
    firstName: enrollment.user.firstName,
    title: `Vencimiento de acceso: ${pickEs(enrollment.course?.title) || "tu curso"}`,
    dueAt: enrollment.accessExpiresAt.toLocaleString("es-PE"),
    url: `${appUrl()}/campus`,
  });

  await notifyByEmail({
    userId: enrollment.userId,
    to: enrollment.user.email,
    template: WORKER_EMAIL_JOBS.COURSE_ACCESS_EXPIRING,
    ...rendered,
  });
}

async function sendAssessmentDue(data: AssessmentDueJobData): Promise<void> {
  const [assessment, enrollment] = await Promise.all([
    prisma.assessment.findUnique({ where: { id: data.assessmentId }, include: { course: true } }),
    prisma.enrollment.findUnique({ where: { id: data.enrollmentId }, include: { user: true } }),
  ]);
  if (!assessment || !enrollment || enrollment.status !== "ACTIVE") return;

  const rendered = renderDeadlineReminder(data.offset, {
    firstName: enrollment.user.firstName,
    title: pickEs(assessment.title) || "tu evaluación",
    dueAt: assessment.availableUntil?.toLocaleString("es-PE") ?? "",
    url: `${appUrl()}/cursos/${assessment.course.slug}`,
  });

  await notifyByEmail({
    userId: enrollment.userId,
    to: enrollment.user.email,
    template: WORKER_EMAIL_JOBS.ASSESSMENT_DUE,
    ...rendered,
  });
}

export async function processReminderJob(job: Job): Promise<void> {
  switch (job.name) {
    case REMINDER_SWEEP_JOB:
      return runSweep();
    case REMINDER_JOBS.LIVE_SESSION_UPCOMING:
      return sendLiveSessionUpcoming(job.data as LiveSessionUpcomingJobData);
    case REMINDER_JOBS.COURSE_ACCESS_EXPIRING:
      return sendAccessExpiring(job.data as CourseAccessExpiringJobData);
    case REMINDER_JOBS.ASSESSMENT_DUE:
      return sendAssessmentDue(job.data as AssessmentDueJobData);
    default:
      logger.warn("job.name desconocido en cola reminder, se ignora", { jobName: job.name, jobId: job.id });
  }
}

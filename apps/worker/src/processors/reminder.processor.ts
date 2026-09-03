import type { Job } from "bullmq";
import { prisma } from "@inkademy/db";
import {
  REMINDER_JOBS,
  REMINDER_SWEEP_JOB,
  EMAIL_CAMPAIGN_SWEEP_JOB,
  WORKER_EMAIL_JOBS,
  ATTENDANCE_SYNC_JOBS,
  type LiveSessionUpcomingJobData,
  type CourseAccessExpiringJobData,
  type AssessmentDueJobData,
  type PartnershipExpiringJobData,
  type SuggestionUnansweredJobData,
  type PlatformLicenseExpiringJobData,
  type LiveSessionOffset,
  type DeadlineOffset,
} from "../queues";
import { reminderQueue, attendanceSyncQueue } from "../lib/queue-client";
import { notifyByEmail, notifyUser, getNotificationSettings } from "../lib/notify";
import {
  renderCourseStartReminder,
  renderLiveClassReminder,
  renderDeadlineReminder,
  renderPartnershipExpiring,
  renderSuggestionUnanswered,
  renderPlatformLicenseExpiring,
} from "../templates/email-templates";
import { runEmailCampaignSweep } from "./email-campaign.processor";
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

/**
 * "Todas las clases en Zoom deben grabarse automáticamente y el alumno debe
 * poder visualizarla" — Zoom ya graba (auto_recording: "cloud", ver
 * ZoomProvider.createMeeting) y processAttendanceSyncJob ya sabe recuperar
 * esa grabación, pero nada disparaba ese job automáticamente: solo se
 * encolaba desde LiveSessionService.syncAttendance, que a su vez solo lo
 * llama un humano (POST /live-sessions/:id/sync-attendance) — un endpoint
 * que ningún botón del frontend termina llamando. En la práctica, ninguna
 * grabación se recuperaba nunca sola. Ahora este sweep (cada 15 min, igual
 * que el resto) encola el job para toda sesión que ya terminó y todavía no
 * tiene recordingUrl — acotado a las últimas 48h para no reintentar para
 * siempre una grabación que Zoom nunca vaya a generar (p.ej. reunión
 * simulada sin token real, o clase cancelada a último momento).
 */
async function sweepEndedLiveSessionsForRecording(): Promise<void> {
  const now = new Date();
  const sessions = await prisma.liveSession.findMany({
    where: {
      providerMeetingId: { not: null },
      recordingUrl: null,
      endsAt: { lt: now, gt: new Date(now.getTime() - 2 * DAY_MS) },
    },
    select: { id: true },
  });
  for (const session of sessions) {
    await attendanceSyncQueue().add(
      ATTENDANCE_SYNC_JOBS.SYNC_LIVE_SESSION,
      { liveSessionId: session.id },
      { jobId: `${ATTENDANCE_SYNC_JOBS.SYNC_LIVE_SESSION}:sweep:${session.id}`, removeOnComplete: true, removeOnFail: 50 },
    );
  }
}

/**
 * Convenio "por vencer": una alerta por institución socia (no por curso —
 * un convenio con 10 cursos no debe mandar 10 avisos), disparada por el
 * CoursePartnership.endDate MÁS PRÓXIMO entre sus cursos activos. Notifica
 * a todo ADMIN (gestión interna — el contacto externo de la institución no
 * recibe nada automático). Plazo de anticipación configurable vía
 * NotificationSettings.partnershipExpiringLeadDays.
 */
async function sweepPartnershipExpiring(): Promise<void> {
  const settings = await getNotificationSettings();
  const leadMs = settings.partnershipExpiringLeadDays * DAY_MS;
  const institutions = await prisma.partnerInstitution.findMany({
    where: { active: true, courses: { some: { endDate: { gt: new Date() } } } },
    select: { id: true, courses: { where: { endDate: { gt: new Date() } }, orderBy: { endDate: "asc" }, take: 1, select: { endDate: true } } },
  });

  for (const institution of institutions) {
    const soonest = institution.courses[0];
    if (!soonest?.endDate) continue;
    const delay = soonest.endDate.getTime() - leadMs - Date.now();
    if (delay <= 0) continue;
    await reminderQueue().add(
      REMINDER_JOBS.PARTNERSHIP_EXPIRING,
      { partnerInstitutionId: institution.id } satisfies PartnershipExpiringJobData,
      // BullMQ exige que un jobId con ":" tenga EXACTAMENTE 3 partes (compat
      // con la convención vieja de jobs repetibles) o ninguno — un jobId de
      // 2 partes como "reminder.partnership-expiring:<uuid>" revienta con
      // "Custom Id cannot contain :". Se usa "-" como separador en su lugar.
      { jobId: `${REMINDER_JOBS.PARTNERSHIP_EXPIRING}-${institution.id}`, delay, removeOnComplete: true, removeOnFail: 200 },
    );
  }
}

/** Sugerencia de curso sin respuesta del admin/soporte pasado un umbral configurable. */
async function sweepSuggestionsUnanswered(): Promise<void> {
  const settings = await getNotificationSettings();
  const thresholdMs = settings.suggestionUnansweredAfterHours * HOUR_MS;
  const suggestions = await prisma.courseSuggestion.findMany({
    where: { respondedAt: null },
    select: { id: true, createdAt: true },
  });
  for (const s of suggestions) {
    const delay = s.createdAt.getTime() + thresholdMs - Date.now();
    if (delay <= 0) continue;
    await reminderQueue().add(
      REMINDER_JOBS.SUGGESTION_UNANSWERED,
      { suggestionId: s.id } satisfies SuggestionUnansweredJobData,
      { jobId: `${REMINDER_JOBS.SUGGESTION_UNANSWERED}-${s.id}`, delay, removeOnComplete: true, removeOnFail: 200 },
    );
  }
}

/** Licencia de arriendo de plataforma por vencer — mismo patrón que convenios, para el módulo de licenciamiento. */
async function sweepPlatformLicenseExpiring(): Promise<void> {
  const settings = await getNotificationSettings();
  const leadMs = settings.platformLicenseExpiringLeadDays * DAY_MS;
  const licenses = await prisma.platformLicense.findMany({
    where: { status: { in: ["ACTIVE", "EXPIRING_SOON"] }, endsAt: { gt: new Date() } },
    select: { id: true, endsAt: true },
  });
  for (const license of licenses) {
    const delay = license.endsAt.getTime() - leadMs - Date.now();
    if (delay <= 0) continue;
    await reminderQueue().add(
      REMINDER_JOBS.PLATFORM_LICENSE_EXPIRING,
      { platformLicenseId: license.id } satisfies PlatformLicenseExpiringJobData,
      { jobId: `${REMINDER_JOBS.PLATFORM_LICENSE_EXPIRING}-${license.id}`, delay, removeOnComplete: true, removeOnFail: 200 },
    );
  }
}

async function runSweep(): Promise<void> {
  const results = await Promise.allSettled([
    sweepLiveSessions(),
    sweepAccessExpiring(),
    sweepExpireAccess(),
    sweepAssessmentDue(),
    sweepEndedLiveSessionsForRecording(),
    sweepPartnershipExpiring(),
    sweepSuggestionsUnanswered(),
    sweepPlatformLicenseExpiring(),
  ]);
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

    await notifyUser({
      userId: enrollment.userId,
      type: "LIVE_SESSION_UPCOMING",
      email: { to: enrollment.user.email, template: WORKER_EMAIL_JOBS.LIVE_SESSION_UPCOMING, ...rendered },
      inApp: { template: WORKER_EMAIL_JOBS.LIVE_SESSION_UPCOMING, title: rendered.subject, body: rendered.text, url: `${appUrl()}/cursos/${session.course.slug}` },
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

  await notifyUser({
    userId: enrollment.userId,
    type: "COURSE_ACCESS_EXPIRING",
    email: { to: enrollment.user.email, template: WORKER_EMAIL_JOBS.COURSE_ACCESS_EXPIRING, ...rendered },
    inApp: { template: WORKER_EMAIL_JOBS.COURSE_ACCESS_EXPIRING, title: rendered.subject, body: rendered.text, url: `${appUrl()}/campus` },
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

  await notifyUser({
    userId: enrollment.userId,
    type: "ASSESSMENT_DUE",
    email: { to: enrollment.user.email, template: WORKER_EMAIL_JOBS.ASSESSMENT_DUE, ...rendered },
    inApp: { template: WORKER_EMAIL_JOBS.ASSESSMENT_DUE, title: rendered.subject, body: rendered.text, url: `${appUrl()}/cursos/${assessment.course.slug}` },
  });
}

async function sendPartnershipExpiring(data: PartnershipExpiringJobData): Promise<void> {
  const institution = await prisma.partnerInstitution.findUnique({
    where: { id: data.partnerInstitutionId },
    include: { courses: { where: { endDate: { gt: new Date() } }, orderBy: { endDate: "asc" }, take: 1, include: { course: true } } },
  });
  if (!institution || !institution.active || institution.courses.length === 0) return;
  const soonest = institution.courses[0];
  if (!soonest.endDate) return;

  const settings = await getNotificationSettings();
  const daysLeft = Math.max(0, Math.round((soonest.endDate.getTime() - Date.now()) / DAY_MS));
  const admins = await prisma.user.findMany({ where: { globalRole: "ADMIN" }, select: { id: true, email: true, firstName: true } });

  for (const admin of admins) {
    const rendered = renderPartnershipExpiring({
      firstName: admin.firstName,
      institutionName: institution.name,
      courseTitle: pickEs(soonest.course.title),
      endsAt: soonest.endDate.toLocaleDateString("es-PE"),
      daysLeft,
      url: `${appUrl()}/admin/convenios`,
    });
    await notifyUser({
      userId: admin.id,
      type: "PARTNERSHIP_EXPIRING",
      email: settings.partnershipExpiringEmail ? { to: admin.email, template: "email.partnership-expiring", ...rendered } : undefined,
      inApp: { template: "email.partnership-expiring", title: rendered.subject, body: rendered.text, url: "/admin/convenios" },
    });
  }
}

async function sendSuggestionUnanswered(data: SuggestionUnansweredJobData): Promise<void> {
  const suggestion = await prisma.courseSuggestion.findUnique({ where: { id: data.suggestionId } });
  if (!suggestion || suggestion.respondedAt) return; // ya la respondieron mientras esperaba el delayed job

  const settings = await getNotificationSettings();
  const preview = suggestion.message.length > 80 ? `${suggestion.message.slice(0, 80)}…` : suggestion.message;
  const rendered = renderSuggestionUnanswered({
    title: preview,
    hoursOpen: settings.suggestionUnansweredAfterHours,
    url: `${appUrl()}/admin/sugerencias`,
  });

  const staff = await prisma.user.findMany({ where: { globalRole: { in: ["ADMIN", "SUPPORT"] } }, select: { id: true, email: true } });
  for (const person of staff) {
    await notifyUser({
      userId: person.id,
      type: "SUGGESTION_UNANSWERED",
      email: settings.suggestionUnansweredEmail ? { to: person.email, template: "email.suggestion-unanswered", ...rendered } : undefined,
      inApp: { template: "email.suggestion-unanswered", title: rendered.subject, body: rendered.text, url: "/admin/sugerencias" },
    });
  }
}

async function sendPlatformLicenseExpiring(data: PlatformLicenseExpiringJobData): Promise<void> {
  const license = await prisma.platformLicense.findUnique({ where: { id: data.platformLicenseId } });
  if (!license || license.status === "CANCELLED" || license.status === "EXPIRED") return;

  const settings = await getNotificationSettings();
  const daysLeft = Math.max(0, Math.round((license.endsAt.getTime() - Date.now()) / DAY_MS));
  const rendered = renderPlatformLicenseExpiring({
    clientName: license.clientName,
    endsAt: license.endsAt.toLocaleDateString("es-PE"),
    daysLeft,
    url: `${appUrl()}/admin/licencias`,
  });

  const admins = await prisma.user.findMany({ where: { globalRole: "ADMIN" }, select: { id: true, email: true } });
  for (const admin of admins) {
    await notifyUser({
      userId: admin.id,
      type: "PLATFORM_LICENSE_EXPIRING",
      email: settings.platformLicenseExpiringEmail ? { to: admin.email, template: "email.platform-license-expiring", ...rendered } : undefined,
      inApp: { template: "email.platform-license-expiring", title: rendered.subject, body: rendered.text, url: "/admin/licencias" },
    });
  }
}

export async function processReminderJob(job: Job): Promise<void> {
  switch (job.name) {
    case REMINDER_SWEEP_JOB:
      return runSweep();
    case EMAIL_CAMPAIGN_SWEEP_JOB:
      return runEmailCampaignSweep();
    case REMINDER_JOBS.LIVE_SESSION_UPCOMING:
      return sendLiveSessionUpcoming(job.data as LiveSessionUpcomingJobData);
    case REMINDER_JOBS.COURSE_ACCESS_EXPIRING:
      return sendAccessExpiring(job.data as CourseAccessExpiringJobData);
    case REMINDER_JOBS.ASSESSMENT_DUE:
      return sendAssessmentDue(job.data as AssessmentDueJobData);
    case REMINDER_JOBS.PARTNERSHIP_EXPIRING:
      return sendPartnershipExpiring(job.data as PartnershipExpiringJobData);
    case REMINDER_JOBS.SUGGESTION_UNANSWERED:
      return sendSuggestionUnanswered(job.data as SuggestionUnansweredJobData);
    case REMINDER_JOBS.PLATFORM_LICENSE_EXPIRING:
      return sendPlatformLicenseExpiring(job.data as PlatformLicenseExpiringJobData);
    default:
      logger.warn("job.name desconocido en cola reminder, se ignora", { jobName: job.name, jobId: job.id });
  }
}

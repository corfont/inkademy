import type { Job } from "bullmq";
import { prisma } from "@inkademy/db";
import { WORKER_EMAIL_JOBS, type AttendanceSyncJobData } from "../queues";
import { fetchLatestAttendanceRecords, getGraphAppToken, isGraphConfigured } from "../lib/graph";
import { notifyByEmail } from "../lib/notify";
import { renderAbsenceNotice } from "../templates/email-templates";
import { createLogger } from "../lib/logger";

const logger = createLogger("attendance-sync.processor");

/**
 * `apps/api` (`LiveSessionService.syncAttendance`) ya hace esta misma
 * sincronización de forma síncrona cuando un admin llama
 * `POST /live-sessions/:id/sync-attendance`, y encola este mismo job para
 * que el worker pueda re-sincronizar periódicamente sin depender de eso
 * (p.ej. si nadie dispara el endpoint después de que termina la clase). El
 * worker repite la misma lógica de forma independiente y además envía el
 * aviso de inasistencia con el link a la grabación — algo que
 * `apps/api` no hace.
 *
 * Si no hay credenciales MS configuradas (MS_TENANT_ID/MS_CLIENT_ID/
 * MS_CLIENT_SECRET) o falta providerMeetingId/organizerUpn, se registra el
 * motivo en logs y se omite sin lanzar error.
 */
export async function processAttendanceSyncJob(job: Job<AttendanceSyncJobData>): Promise<void> {
  const { liveSessionId } = job.data;

  const liveSession = await prisma.liveSession.findUnique({
    where: { id: liveSessionId },
    include: { course: true },
  });
  if (!liveSession) {
    logger.warn("live session no encontrada", { liveSessionId });
    return;
  }

  if (!isGraphConfigured() || !liveSession.providerMeetingId || !liveSession.organizerUpn) {
    logger.info("sincronización de asistencia omitida (Graph no configurado o falta meetingId/organizerUpn)", {
      liveSessionId,
      hasMeetingId: Boolean(liveSession.providerMeetingId),
      hasOrganizerUpn: Boolean(liveSession.organizerUpn),
    });
    return;
  }

  const token = await getGraphAppToken();
  if (!token) return; // ya se registró el motivo en getGraphAppToken()

  const enrollments = await prisma.enrollment.findMany({
    where: { courseId: liveSession.courseId, status: "ACTIVE" },
    include: { user: true },
  });
  const byEmail = new Map(enrollments.map((e) => [e.user.email.toLowerCase(), e.user]));

  try {
    const records = await fetchLatestAttendanceRecords(liveSession.organizerUpn, liveSession.providerMeetingId, token);

    for (const record of records) {
      const email = record.emailAddress?.toLowerCase();
      const user = email ? byEmail.get(email) : undefined;
      if (!user) continue; // asistente no matriculado (invitado externo, docente, etc.)

      const intervals = record.attendanceIntervals ?? [];
      const joinedAt = intervals.length > 0 ? new Date(intervals[0].joinDateTime) : null;
      const leftAt = intervals.length > 0 ? new Date(intervals.at(-1)!.leaveDateTime) : null;
      const durationMin = record.totalAttendanceInSeconds != null ? Math.round(record.totalAttendanceInSeconds / 60) : null;

      await prisma.attendance.upsert({
        where: { liveSessionId_userId: { liveSessionId: liveSession.id, userId: user.id } },
        create: {
          liveSessionId: liveSession.id,
          userId: user.id,
          joinedAt,
          leftAt,
          durationMin,
          source: "teams_graph_report",
        },
        update: { joinedAt, leftAt, durationMin, source: "teams_graph_report" },
      });
    }

    if (liveSession.endsAt.getTime() < Date.now() && liveSession.status !== "COMPLETED") {
      await prisma.liveSession.update({ where: { id: liveSession.id }, data: { status: "COMPLETED" } });
    }

    // Aviso de inasistencia con link a la grabación, para quien no tiene registro de Attendance.
    if (liveSession.recordingUrl) {
      const attended = await prisma.attendance.findMany({
        where: { liveSessionId: liveSession.id },
        select: { userId: true },
      });
      const attendedIds = new Set(attended.map((a) => a.userId));
      const absentees = enrollments.filter((e) => !attendedIds.has(e.userId));

      const courseTitle = (liveSession.course.title as Record<string, string> | null)?.es ?? "";
      for (const absentee of absentees) {
        const rendered = renderAbsenceNotice({
          firstName: absentee.user.firstName,
          courseTitle,
          sessionDate: liveSession.startsAt.toLocaleDateString("es-PE"),
          recordingUrl: liveSession.recordingUrl,
        });
        await notifyByEmail({
          userId: absentee.userId,
          to: absentee.user.email,
          template: WORKER_EMAIL_JOBS.ABSENCE_NOTICE,
          ...rendered,
          jobId: `${WORKER_EMAIL_JOBS.ABSENCE_NOTICE}:${liveSession.id}:${absentee.userId}`,
        });
      }
    }

    logger.info("asistencia sincronizada", { liveSessionId, records: records.length });
  } catch (err) {
    logger.error("fallo al sincronizar asistencia con Microsoft Graph", { liveSessionId, err: String(err) });
    throw err;
  }
}

import type { Job } from "bullmq";
import { prisma } from "@inkademy/db";
import { WORKER_EMAIL_JOBS, type AttendanceSyncJobData } from "../queues";
import { fetchLatestAttendanceRecords, getGraphAppToken, isGraphConfigured } from "../lib/graph";
import { fetchZoomAttendanceRecords, fetchZoomRecordingUrl, isZoomConfigured } from "../lib/zoom";
import { notifyByEmail } from "../lib/notify";
import { renderAbsenceNotice } from "../templates/email-templates";
import { createLogger } from "../lib/logger";

const logger = createLogger("attendance-sync.processor");

/**
 * Aviso de inasistencia con link a la grabación, para quien no tiene
 * registro de Attendance — compartido por ambos proveedores, ver
 * processAttendanceSyncJob.
 */
async function notifyAbsenteesIfRecordingReady<E extends { userId: string; user: { firstName: string; email: string } }>(
  liveSession: { id: string; recordingUrl: string | null; startsAt: Date; course: { title: unknown } },
  enrollments: E[],
): Promise<void> {
  if (!liveSession.recordingUrl) return;

  const attended = await prisma.attendance.findMany({ where: { liveSessionId: liveSession.id }, select: { userId: true } });
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

/**
 * `apps/api` (`LiveSessionService.syncAttendance`) ya hace esta misma
 * sincronización (asistencia + grabación) de forma síncrona cuando alguien
 * llama `POST /live-sessions/:id/sync-attendance`, y encola este mismo job
 * para que el worker pueda re-sincronizar periódicamente sin depender de
 * eso — necesario sobre todo para la grabación de Zoom, que puede tardar
 * varios minutos en procesarse después de que termina la clase (un único
 * intento justo al terminar casi siempre la encuentra "aún no lista"). El
 * worker repite la misma lógica de forma independiente y además envía el
 * aviso de inasistencia con el link a la grabación — algo que `apps/api`
 * no hace.
 *
 * Se ramifica por `liveSession.provider` — antes este processor asumía
 * Teams sin mirar el proveedor real de la sesión (solo revisaba si Graph
 * estaba configurado), así que una sesión de Zoom con Graph configurado
 * por casualidad habría intentado llamar a Graph con un meetingId de Zoom.
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
  if (!liveSession.providerMeetingId) {
    logger.info("sincronización omitida (sin providerMeetingId)", { liveSessionId });
    return;
  }

  const enrollments = await prisma.enrollment.findMany({
    where: { courseId: liveSession.courseId, status: "ACTIVE" },
    include: { user: true },
  });
  const byEmail = new Map(enrollments.map((e) => [e.user.email.toLowerCase(), e.user]));

  try {
    if (liveSession.provider === "ZOOM") {
      if (!isZoomConfigured()) {
        logger.info("sincronización de Zoom omitida (ZOOM_ACCOUNT_ID/ZOOM_CLIENT_ID/ZOOM_CLIENT_SECRET no configurados)", { liveSessionId });
        return;
      }
      const records = await fetchZoomAttendanceRecords(liveSession.providerMeetingId);
      for (const record of records) {
        const user = byEmail.get(record.email.toLowerCase());
        if (!user) continue;
        await prisma.attendance.upsert({
          where: { liveSessionId_userId: { liveSessionId: liveSession.id, userId: user.id } },
          create: { liveSessionId: liveSession.id, userId: user.id, joinedAt: record.joinedAt, leftAt: record.leftAt, durationMin: record.durationMin, source: "zoom_report" },
          update: { joinedAt: record.joinedAt, leftAt: record.leftAt, durationMin: record.durationMin },
        });
      }

      if (liveSession.endsAt.getTime() < Date.now() && !liveSession.recordingUrl) {
        const recordingUrl = await fetchZoomRecordingUrl(liveSession.providerMeetingId);
        if (recordingUrl) {
          liveSession.recordingUrl = recordingUrl;
          await prisma.liveSession.update({ where: { id: liveSession.id }, data: { recordingUrl } });
        }
      }

      if (liveSession.endsAt.getTime() < Date.now() && liveSession.status !== "COMPLETED") {
        await prisma.liveSession.update({ where: { id: liveSession.id }, data: { status: "COMPLETED" } });
      }

      await notifyAbsenteesIfRecordingReady(liveSession, enrollments);
      logger.info("asistencia sincronizada (Zoom)", { liveSessionId, records: records.length });
      return;
    }

    // provider === "TEAMS"
    if (!isGraphConfigured() || !liveSession.organizerUpn) {
      logger.info("sincronización de Teams omitida (Graph no configurado o falta organizerUpn)", {
        liveSessionId,
        hasOrganizerUpn: Boolean(liveSession.organizerUpn),
      });
      return;
    }
    const token = await getGraphAppToken();
    if (!token) return; // ya se registró el motivo en getGraphAppToken()

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
        create: { liveSessionId: liveSession.id, userId: user.id, joinedAt, leftAt, durationMin, source: "teams_graph_report" },
        update: { joinedAt, leftAt, durationMin, source: "teams_graph_report" },
      });
    }

    if (liveSession.endsAt.getTime() < Date.now() && liveSession.status !== "COMPLETED") {
      await prisma.liveSession.update({ where: { id: liveSession.id }, data: { status: "COMPLETED" } });
    }

    // Nota: la grabación de Teams no se recupera en esta entrega — ver
    // TeamsProvider.getRecordingUrl en apps/api. recordingUrl solo se
    // popula para sesiones ZOOM.
    await notifyAbsenteesIfRecordingReady(liveSession, enrollments);
    logger.info("asistencia sincronizada (Teams)", { liveSessionId, records: records.length });
  } catch (err) {
    logger.error("fallo al sincronizar asistencia", { liveSessionId, provider: liveSession.provider, err: String(err) });
    throw err;
  }
}

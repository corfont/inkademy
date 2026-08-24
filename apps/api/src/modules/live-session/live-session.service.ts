import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import type { Queue } from "bullmq";
import type { PrismaClient } from "@inkademy/db";
import { PRISMA } from "../../common/prisma/prisma.module";
import { ATTENDANCE_SYNC_JOBS, QUEUE_NAMES } from "../../common/queues/queue.constants";
import { CalendarService } from "../calendar/calendar.service";
import { NotificationService } from "../notification/notification.service";
import { TeamsProvider } from "./providers/teams.provider";

const JOIN_WINDOW_BEFORE_MIN = 15;

@Injectable()
export class LiveSessionService {
  private readonly logger = new Logger(LiveSessionService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly teamsProvider: TeamsProvider,
    private readonly config: ConfigService,
    private readonly calendarService: CalendarService,
    private readonly notifications: NotificationService,
    @InjectQueue(QUEUE_NAMES.ATTENDANCE_SYNC) private readonly attendanceSyncQueue: Queue,
  ) {}

  async create(input: {
    courseId: string;
    title?: unknown;
    startsAt: Date;
    endsAt: Date;
    timezone?: string;
    capacity?: number;
    organizerUpn?: string;
  }) {
    const course = await this.prisma.course.findUnique({ where: { id: input.courseId } });
    if (!course) throw new NotFoundException("Curso no encontrado");

    const organizerUpn =
      input.organizerUpn ?? this.config.get<string>("MS_TEAMS_ORGANIZER_UPN") ?? "docente@inkademy.com";
    const subject = ((input.title as Record<string, string>)?.es ?? (course.title as Record<string, string>).es) ?? course.slug;

    const meeting = await this.teamsProvider.createMeeting({
      subject,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      organizerUpn,
    });

    return this.prisma.liveSession.create({
      data: {
        courseId: input.courseId,
        title: input.title as object,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        timezone: input.timezone ?? "America/Lima",
        capacity: input.capacity,
        organizerUpn,
        providerMeetingId: meeting.providerMeetingId,
        joinUrl: meeting.joinUrl,
      },
    });
  }

  async join(liveSessionId: string, userId: string) {
    const session = await this.prisma.liveSession.findUnique({
      where: { id: liveSessionId },
      include: { course: { include: { staff: true } } },
    });
    if (!session) throw new NotFoundException("Sesión en vivo no encontrada");

    const isStaff = session.course.staff.some((s) => s.userId === userId);
    if (!isStaff) {
      const enrollment = await this.prisma.enrollment.findFirst({
        where: { userId, courseId: session.courseId, offeringKind: "COURSE", status: "ACTIVE" },
      });
      if (!enrollment) throw new ForbiddenException("No estás matriculado en este curso");
    }

    const now = new Date();
    const windowStart = new Date(session.startsAt.getTime() - JOIN_WINDOW_BEFORE_MIN * 60 * 1000);
    if (now < windowStart) throw new ForbiddenException("Todavía no se habilitó el acceso a esta clase");
    if (now > session.endsAt) throw new ForbiddenException("Esta clase ya finalizó");

    if (!session.joinUrl) throw new NotFoundException("Esta sesión no tiene un enlace de acceso configurado");
    return { joinUrl: session.joinUrl, role: isStaff ? "organizer" : "attendee" };
  }

  /**
   * Reprograma una sesión en vivo por causas ajenas (problema técnico,
   * indisponibilidad del docente, etc.) y avisa a TODOS los inscritos
   * activos del curso — no solo actualiza la fecha, sino que:
   * 1. Intenta reprogramar la reunión de Teams (best-effort: si Graph falla
   *    o no hay credenciales configuradas, no bloquea — lo que de verdad
   *    gobierna la ventana de acceso es `LiveSession.startsAt/endsAt` en
   *    nuestra BD, no el metadato de calendario de Teams).
   * 2. Actualiza los `CalendarEvent` de cada inscrito (si no, la agenda de
   *    cada alumno seguiría mostrando la hora vieja).
   * 3. Deja un `AuditLog` con el antes/después y quién lo hizo.
   * 4. Encola un correo a cada inscrito con el motivo del cambio.
   */
  async reschedule(
    liveSessionId: string,
    actorId: string,
    input: { startsAt: Date; endsAt: Date; reason: string },
  ) {
    const session = await this.prisma.liveSession.findUnique({
      where: { id: liveSessionId },
      include: { course: true },
    });
    if (!session) throw new NotFoundException("Sesión en vivo no encontrada");
    if (session.status === "COMPLETED" || session.status === "CANCELLED") {
      throw new BadRequestException("No se puede reprogramar una sesión ya finalizada o cancelada");
    }
    if (input.endsAt <= input.startsAt) {
      throw new BadRequestException("La hora de término debe ser posterior a la de inicio");
    }

    const previousStartsAt = session.startsAt;
    const previousEndsAt = session.endsAt;

    if (session.providerMeetingId && session.organizerUpn) {
      try {
        await this.teamsProvider.updateMeeting(session.providerMeetingId, session.organizerUpn, {
          startsAt: input.startsAt,
          endsAt: input.endsAt,
        });
      } catch (err) {
        this.logger.warn(
          `No se pudo reprogramar la reunión de Teams de la sesión ${liveSessionId} (se continúa igual, la BD es la fuente de verdad): ${String(err)}`,
        );
      }
    }

    const updated = await this.prisma.liveSession.update({
      where: { id: liveSessionId },
      data: { startsAt: input.startsAt, endsAt: input.endsAt },
    });

    await this.calendarService.rescheduleLiveSessionEvents(liveSessionId, input.startsAt, input.endsAt);

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: "LIVE_SESSION_RESCHEDULE",
        entity: "LiveSession",
        entityId: liveSessionId,
        before: { startsAt: previousStartsAt.toISOString(), endsAt: previousEndsAt.toISOString() },
        after: { startsAt: input.startsAt.toISOString(), endsAt: input.endsAt.toISOString(), reason: input.reason },
      },
    });

    const enrollments = await this.prisma.enrollment.findMany({
      where: { courseId: session.courseId, offeringKind: "COURSE", status: "ACTIVE" },
      include: { user: true },
    });
    const courseTitle = ((session.course.title as Record<string, string>) ?? {}).es ?? session.course.slug;
    for (const enrollment of enrollments) {
      await this.notifications.sendLiveSessionRescheduled(
        enrollment.user.email,
        courseTitle,
        previousStartsAt,
        input.startsAt,
        input.reason,
        enrollment.userId,
      );
    }

    return { ...updated, notifiedCount: enrollments.length };
  }

  /**
   * Llama a Graph `reports/getMeetingAttendanceReport` (vía TeamsProvider) y
   * puebla `Attendance`. También encola un job en la cola "attendance-sync"
   * para que apps/worker pueda re-sincronizar periódicamente sin depender de
   * que un admin dispare este endpoint manualmente.
   */
  async syncAttendance(liveSessionId: string) {
    const session = await this.prisma.liveSession.findUnique({ where: { id: liveSessionId } });
    if (!session) throw new NotFoundException("Sesión en vivo no encontrada");
    if (!session.providerMeetingId) {
      throw new NotFoundException("Esta sesión no tiene una reunión de Teams asociada");
    }

    const records = await this.teamsProvider.getAttendanceReport(
      session.providerMeetingId,
      session.organizerUpn ?? "",
    );

    let upserted = 0;
    for (const record of records) {
      const user = await this.prisma.user.findUnique({ where: { email: record.email } });
      if (!user) continue;
      await this.prisma.attendance.upsert({
        where: { liveSessionId_userId: { liveSessionId, userId: user.id } },
        create: {
          liveSessionId,
          userId: user.id,
          joinedAt: record.joinedAt,
          leftAt: record.leftAt,
          durationMin: record.durationMin,
        },
        update: { joinedAt: record.joinedAt, leftAt: record.leftAt, durationMin: record.durationMin },
      });
      upserted += 1;
    }

    if (new Date() > session.endsAt) {
      await this.prisma.liveSession.update({ where: { id: liveSessionId }, data: { status: "COMPLETED" } });
    }

    await this.attendanceSyncQueue.add(
      ATTENDANCE_SYNC_JOBS.SYNC_LIVE_SESSION,
      { liveSessionId },
      { removeOnComplete: true, removeOnFail: 50 },
    );

    return { syncedRecords: upserted };
  }
}

import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
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

  /**
   * Horas ya programadas (sesiones no canceladas) vs. duración total del
   * curso — "debe mostrarle al docente cuántas horas faltan por programar
   * y si se excede debe indicar que no puede exceder el tiempo de la
   * duración del curso".
   */
  async getScheduleSummary(courseId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException("Curso no encontrado");
    const sessions = await this.prisma.liveSession.findMany({
      where: { courseId, status: { not: "CANCELLED" } },
      select: { startsAt: true, endsAt: true },
    });
    const scheduledHours = sessions.reduce((sum, s) => sum + (s.endsAt.getTime() - s.startsAt.getTime()) / 3_600_000, 0);
    return {
      totalHours: course.durationHours,
      scheduledHours: Math.round(scheduledHours * 100) / 100,
      remainingHours: Math.max(0, Math.round((course.durationHours - scheduledHours) * 100) / 100),
    };
  }

  /** Choque de horario: mismo docente, otra sesión no cancelada que se solapa. */
  private async assertNoTeacherConflict(teacherId: string | undefined, startsAt: Date, endsAt: Date, excludeId?: string) {
    if (!teacherId) return;
    const conflict = await this.prisma.liveSession.findFirst({
      where: {
        teacherId,
        status: { not: "CANCELLED" },
        ...(excludeId ? { id: { not: excludeId } } : {}),
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      include: { course: true },
    });
    if (conflict) {
      const courseTitle = ((conflict.course.title as Record<string, string>) ?? {}).es ?? conflict.course.slug;
      throw new ConflictException(
        `El docente ya tiene una sesión programada en ese horario (${conflict.startsAt.toLocaleString("es-PE")} — "${courseTitle}"). Elige otro horario.`,
      );
    }
  }

  /** No se puede programar más horas de las que dura el curso. */
  private assertWithinCourseDuration(existingHours: number, addedHours: number, totalHours: number) {
    if (existingHours + addedHours > totalHours + 0.01) {
      const remaining = Math.max(0, Math.round((totalHours - existingHours) * 100) / 100);
      throw new BadRequestException(
        `No puedes exceder la duración total del curso (${totalHours}h). Quedan ${remaining}h por programar.`,
      );
    }
  }

  async create(input: {
    courseId: string;
    title?: unknown;
    startsAt: Date;
    endsAt: Date;
    timezone?: string;
    capacity?: number;
    organizerUpn?: string;
    teacherId?: string;
  }) {
    const course = await this.prisma.course.findUnique({ where: { id: input.courseId } });
    if (!course) throw new NotFoundException("Curso no encontrado");
    if (input.endsAt <= input.startsAt) throw new BadRequestException("La hora de término debe ser posterior a la de inicio");

    await this.assertNoTeacherConflict(input.teacherId, input.startsAt, input.endsAt);
    const { scheduledHours } = await this.getScheduleSummary(input.courseId);
    this.assertWithinCourseDuration(scheduledHours, (input.endsAt.getTime() - input.startsAt.getTime()) / 3_600_000, course.durationHours);

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
        teacherId: input.teacherId,
        providerMeetingId: meeting.providerMeetingId,
        joinUrl: meeting.joinUrl,
      },
    });
  }

  /**
   * "Puede ser una sola vez o repetitivo en la semana hasta que se cumpla
   * la duración del curso" — genera sesiones semanales (mismo día/hora) a
   * partir de firstStartsAt hasta agotar la duración del curso. Valida
   * TODAS las ocurrencias contra choques de horario del docente ANTES de
   * crear ninguna (si una sola choca, se aborta la serie completa — "no
   * permitir que haya una duplicidad", no solo avisar a medias).
   */
  async createWeeklySeries(input: {
    courseId: string;
    title?: unknown;
    firstStartsAt: Date;
    sessionDurationMinutes: number;
    timezone?: string;
    capacity?: number;
    organizerUpn?: string;
    teacherId?: string;
  }) {
    const course = await this.prisma.course.findUnique({ where: { id: input.courseId } });
    if (!course) throw new NotFoundException("Curso no encontrado");

    const { scheduledHours } = await this.getScheduleSummary(input.courseId);
    const remainingHours = Math.max(0, course.durationHours - scheduledHours);
    const sessionHours = input.sessionDurationMinutes / 60;
    if (sessionHours <= 0 || remainingHours <= 0) {
      throw new BadRequestException("Este curso ya tiene programada toda su duración — no quedan horas por programar.");
    }

    const occurrences: { startsAt: Date; endsAt: Date }[] = [];
    let hoursSoFar = 0;
    let cursor = new Date(input.firstStartsAt);
    // Tope de seguridad (2 años de semanas) para nunca generar un loop infinito.
    for (let i = 0; i < 104 && hoursSoFar < remainingHours - 0.01; i++) {
      const startsAt = new Date(cursor);
      // La última sesión se recorta para calzar exacto con lo que falta,
      // en vez de pasarse de la duración total del curso.
      const hoursLeftForThisOne = Math.min(sessionHours, remainingHours - hoursSoFar);
      const endsAt = new Date(startsAt.getTime() + hoursLeftForThisOne * 3_600_000);
      occurrences.push({ startsAt, endsAt });
      hoursSoFar += hoursLeftForThisOne;
      cursor = new Date(cursor.getTime() + 7 * 24 * 3_600_000);
    }

    // Valida TODAS antes de crear ninguna.
    for (const occ of occurrences) {
      await this.assertNoTeacherConflict(input.teacherId, occ.startsAt, occ.endsAt);
    }

    const organizerUpn = input.organizerUpn ?? this.config.get<string>("MS_TEAMS_ORGANIZER_UPN") ?? "docente@inkademy.com";
    const subject = ((input.title as Record<string, string>)?.es ?? (course.title as Record<string, string>).es) ?? course.slug;
    const seriesId = `series-${Date.now()}-${Math.round(Math.random() * 1e6)}`;

    const created = [];
    for (const occ of occurrences) {
      const meeting = await this.teamsProvider.createMeeting({ subject, startsAt: occ.startsAt, endsAt: occ.endsAt, organizerUpn });
      created.push(
        await this.prisma.liveSession.create({
          data: {
            courseId: input.courseId,
            title: input.title as object,
            startsAt: occ.startsAt,
            endsAt: occ.endsAt,
            timezone: input.timezone ?? "America/Lima",
            capacity: input.capacity,
            organizerUpn,
            teacherId: input.teacherId,
            seriesId,
            providerMeetingId: meeting.providerMeetingId,
            joinUrl: meeting.joinUrl,
          },
        }),
      );
    }
    return created;
  }

  /** El docente/admin puede cancelar en cualquier momento — libera esas horas del presupuesto del curso. */
  async cancel(liveSessionId: string, actorId: string, reason: string) {
    const session = await this.prisma.liveSession.findUnique({ where: { id: liveSessionId } });
    if (!session) throw new NotFoundException("Sesión en vivo no encontrada");
    if (session.status === "COMPLETED" || session.status === "CANCELLED") {
      throw new BadRequestException("Esta sesión ya finalizó o ya está cancelada");
    }
    const updated = await this.prisma.liveSession.update({ where: { id: liveSessionId }, data: { status: "CANCELLED" } });
    await this.prisma.auditLog.create({
      data: { actorId, action: "LIVE_SESSION_CANCEL", entity: "LiveSession", entityId: liveSessionId, after: { reason } },
    });
    return updated;
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
    await this.assertNoTeacherConflict(session.teacherId ?? undefined, input.startsAt, input.endsAt, liveSessionId);

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

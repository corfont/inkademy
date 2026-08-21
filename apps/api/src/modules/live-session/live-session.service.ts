import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import type { Queue } from "bullmq";
import type { PrismaClient } from "@inkademy/db";
import { PRISMA } from "../../common/prisma/prisma.module";
import { ATTENDANCE_SYNC_JOBS, QUEUE_NAMES } from "../../common/queues/queue.constants";
import { TeamsProvider } from "./providers/teams.provider";

const JOIN_WINDOW_BEFORE_MIN = 15;

@Injectable()
export class LiveSessionService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly teamsProvider: TeamsProvider,
    private readonly config: ConfigService,
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

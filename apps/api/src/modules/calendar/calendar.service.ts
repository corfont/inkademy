import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { createEvents, type EventAttributes } from "ics";
import type { CalendarEventType, PrismaClient } from "@inkademy/db";
import { PRISMA } from "../../common/prisma/prisma.module";

@Injectable()
export class CalendarService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  // "Si le doy clic a un curso agendado o actividad me debería derivar ya
  // sea al curso o al Teams" — cada evento trae ahora `courseId` (propio o
  // resuelto vía la sesión en vivo) y `enrollmentId` (la matrícula de ESTE
  // usuario en ese curso, para poder linkear a /campus/cursos/:enrollmentId,
  // que es la ruta real del reproductor — no existe una ruta por courseId).
  async listMine(userId: string, from?: Date, to?: Date) {
    const events = await this.prisma.calendarEvent.findMany({
      where: {
        userId,
        ...(from || to
          ? { startsAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
          : {}),
      },
      include: { liveSession: { select: { courseId: true, recordingUrl: true } } },
      orderBy: { startsAt: "asc" },
    });

    const courseIds = [...new Set(events.map((e) => e.courseId ?? e.liveSession?.courseId).filter((id): id is string => Boolean(id)))];
    const enrollments = courseIds.length
      ? await this.prisma.enrollment.findMany({
          where: { userId, courseId: { in: courseIds } },
          select: { id: true, courseId: true },
          orderBy: { enrolledAt: "desc" },
        })
      : [];
    const enrollmentByCourse = new Map(enrollments.map((e) => [e.courseId, e.id]));

    return events.map(({ liveSession, ...e }) => {
      const courseId = e.courseId ?? liveSession?.courseId ?? null;
      return {
        ...e,
        courseId,
        enrollmentId: courseId ? (enrollmentByCourse.get(courseId) ?? null) : null,
        recordingUrl: liveSession?.recordingUrl ?? null,
      };
    });
  }

  async createMine(
    userId: string,
    input: { type: CalendarEventType; title: string; startsAt: Date; endsAt?: Date; liveSessionId?: string },
  ) {
    return this.prisma.calendarEvent.create({ data: { userId, ...input } });
  }

  async updateMine(
    userId: string,
    id: string,
    input: Partial<{ type: CalendarEventType; title: string; startsAt: Date; endsAt?: Date }>,
  ) {
    const event = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!event || event.userId !== userId) throw new NotFoundException("Evento no encontrado");
    return this.prisma.calendarEvent.update({ where: { id }, data: input });
  }

  async deleteMine(userId: string, id: string) {
    const event = await this.prisma.calendarEvent.findUnique({ where: { id } });
    if (!event) throw new NotFoundException("Evento no encontrado");
    if (event.userId !== userId) throw new ForbiddenException("No puedes borrar el evento de otro usuario");
    await this.prisma.calendarEvent.delete({ where: { id } });
  }

  /**
   * Genera/actualiza la agenda de un usuario tras una matrícula: inicio de
   * curso, expiración de acceso y cada sesión en vivo programada.
   */
  async scheduleForEnrollment(
    userId: string,
    course: { id: string; title: unknown },
    accessExpiresAt: Date | null,
  ) {
    const title = (course.title as Record<string, string>)?.es ?? "Curso Inkademy";

    await this.prisma.calendarEvent.create({
      data: { userId, type: "COURSE_START", title: `Inicio: ${title}`, startsAt: new Date(), courseId: course.id },
    });

    if (accessExpiresAt) {
      await this.prisma.calendarEvent.create({
        data: {
          userId,
          type: "ACCESS_EXPIRATION",
          title: `Vence tu acceso a: ${title}`,
          startsAt: accessExpiresAt,
          courseId: course.id,
        },
      });
    }

    const liveSessions = await this.prisma.liveSession.findMany({
      where: { courseId: course.id, startsAt: { gt: new Date() } },
    });
    for (const session of liveSessions) {
      await this.prisma.calendarEvent.create({
        data: {
          userId,
          type: "LIVE_CLASS",
          title: `Clase en vivo: ${title}`,
          startsAt: session.startsAt,
          endsAt: session.endsAt,
          liveSessionId: session.id,
          courseId: course.id,
        },
      });
    }
  }

  /**
   * Actualiza el horario en la agenda de TODOS los inscritos cuando se
   * reprograma una sesión en vivo (ver LiveSessionService.reschedule) — sin
   * esto, cada alumno seguía viendo la hora vieja en /campus/agenda aunque
   * la sesión ya estuviera reprogramada en la base.
   */
  async rescheduleLiveSessionEvents(liveSessionId: string, startsAt: Date, endsAt: Date) {
    return this.prisma.calendarEvent.updateMany({
      where: { liveSessionId },
      data: { startsAt, endsAt },
    });
  }

  async generateIcsForUser(userId: string): Promise<string> {
    const events = await this.prisma.calendarEvent.findMany({ where: { userId } });
    const icsEvents: EventAttributes[] = events.map((e) => {
      const start = e.startsAt;
      const end = e.endsAt ?? new Date(start.getTime() + 60 * 60 * 1000);
      return {
        uid: e.icsUid,
        title: e.title,
        start: [start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate(), start.getUTCHours(), start.getUTCMinutes()],
        end: [end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate(), end.getUTCHours(), end.getUTCMinutes()],
        startInputType: "utc",
        endInputType: "utc",
        calName: "Inkademy",
      };
    });
    const { error, value } = createEvents(icsEvents);
    if (error) throw error;
    return value ?? "";
  }
}

import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import type { RequestUser } from "../../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { teacherScopeId } from "../../common/utils/scope";
import {
  cancelLiveSessionSchema,
  createLiveSessionSchema,
  createLiveSessionSeriesSchema,
  rescheduleLiveSessionSchema,
} from "../../common/validation/local-schemas";
import { LiveSessionService } from "./live-session.service";

@ApiTags("live-sessions")
@ApiBearerAuth()
@Controller("live-sessions")
export class LiveSessionController {
  constructor(private readonly liveSessionService: LiveSessionService) {}

  // Adicional al contrato explícito (que solo lista join/sync-attendance):
  // necesario para poder programar sesiones y así generar el joinUrl de Teams.
  @Post()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Programa una sesión en vivo y crea la reunión (Zoom por defecto, Teams como alternativa) — TEACHER solo si es CourseStaff de ese curso" })
  create(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(createLiveSessionSchema)) dto: any) {
    return this.liveSessionService.create(dto, teacherScopeId(user));
  }

  @Post("series")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Programa una serie semanal recurrente hasta completar la duración del curso — TEACHER solo si es CourseStaff de ese curso" })
  createSeries(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(createLiveSessionSeriesSchema)) dto: any) {
    return this.liveSessionService.createWeeklySeries(dto, teacherScopeId(user));
  }

  @Get("schedule-summary/:courseId")
  @ApiOperation({ summary: "Horas ya programadas vs. duración total del curso" })
  scheduleSummary(@Param("courseId") courseId: string) {
    return this.liveSessionService.getScheduleSummary(courseId);
  }

  @Patch(":id/cancel")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Cancela una sesión en vivo (libera esas horas del presupuesto del curso) — TEACHER solo si es CourseStaff del curso dueño" })
  cancel(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body(new ZodValidationPipe(cancelLiveSessionSchema)) dto: { reason: string }) {
    return this.liveSessionService.cancel(id, user.id, dto.reason, teacherScopeId(user));
  }

  @Patch(":id/reschedule")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Reprograma una sesión en vivo (fecha/hora) y notifica por correo a todos los inscritos activos del curso — TEACHER solo si es CourseStaff del curso dueño",
  })
  reschedule(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(rescheduleLiveSessionSchema)) dto: any,
  ) {
    return this.liveSessionService.reschedule(id, user.id, dto, teacherScopeId(user));
  }

  @Get(":id/join")
  @ApiOperation({ summary: "Valida matrícula + ventana horaria y devuelve el joinUrl de la reunión (Zoom o Teams, según cómo se creó)" })
  join(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.liveSessionService.join(id, user.id);
  }

  @Post(":id/sync-attendance")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "TEACHER", "SUPPORT")
  @ApiOperation({ summary: "(admin/worker) Sincroniza asistencia desde Microsoft Graph" })
  syncAttendance(@Param("id") id: string) {
    return this.liveSessionService.syncAttendance(id);
  }
}

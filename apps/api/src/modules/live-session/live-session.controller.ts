import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import type { RequestUser } from "../../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
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
  @ApiOperation({ summary: "Programa una sesión en vivo y crea la reunión de Teams" })
  create(@Body(new ZodValidationPipe(createLiveSessionSchema)) dto: any) {
    return this.liveSessionService.create(dto);
  }

  @Post("series")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Programa una serie semanal recurrente hasta completar la duración del curso" })
  createSeries(@Body(new ZodValidationPipe(createLiveSessionSeriesSchema)) dto: any) {
    return this.liveSessionService.createWeeklySeries(dto);
  }

  @Get("schedule-summary/:courseId")
  @ApiOperation({ summary: "Horas ya programadas vs. duración total del curso" })
  scheduleSummary(@Param("courseId") courseId: string) {
    return this.liveSessionService.getScheduleSummary(courseId);
  }

  @Patch(":id/cancel")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Cancela una sesión en vivo (libera esas horas del presupuesto del curso)" })
  cancel(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body(new ZodValidationPipe(cancelLiveSessionSchema)) dto: { reason: string }) {
    return this.liveSessionService.cancel(id, user.id, dto.reason);
  }

  @Patch(":id/reschedule")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({
    summary: "Reprograma una sesión en vivo (fecha/hora) y notifica por correo a todos los inscritos activos del curso",
  })
  reschedule(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(rescheduleLiveSessionSchema)) dto: any,
  ) {
    return this.liveSessionService.reschedule(id, user.id, dto);
  }

  @Get(":id/join")
  @ApiOperation({ summary: "Valida matrícula + ventana horaria y devuelve el joinUrl de Teams" })
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

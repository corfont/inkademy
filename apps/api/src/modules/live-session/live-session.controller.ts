import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import type { RequestUser } from "../../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { createLiveSessionSchema, rescheduleLiveSessionSchema } from "../../common/validation/local-schemas";
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

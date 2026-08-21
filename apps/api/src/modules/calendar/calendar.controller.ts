import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { RequestUser } from "../../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { createCalendarEventSchema, updateCalendarEventSchema } from "../../common/validation/local-schemas";
import { CalendarService } from "./calendar.service";

@ApiTags("me")
@ApiBearerAuth()
@Controller("me/calendar")
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get()
  @ApiOperation({ summary: "Mi agenda (clases en vivo, vencimientos, exámenes...)" })
  list(@CurrentUser() user: RequestUser, @Query("from") from?: string, @Query("to") to?: string) {
    return this.calendarService.listMine(user.id, from ? new Date(from) : undefined, to ? new Date(to) : undefined);
  }

  // Nota: el contrato solo pide GET /me/calendar y /me/calendar.ics; se agregan
  // estos endpoints CRUD adicionales (documentados en IMPLEMENTATION-NOTES.md)
  // porque el módulo calendar del enunciado pide "CRUD CalendarEvent".
  @Post()
  @ApiOperation({ summary: "Crea un evento personal en la agenda" })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createCalendarEventSchema)) dto: any,
  ) {
    return this.calendarService.createMine(user.id, dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Actualiza un evento personal de la agenda" })
  update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCalendarEventSchema)) dto: any,
  ) {
    return this.calendarService.updateMine(user.id, id, dto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Elimina un evento personal de la agenda" })
  remove(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.calendarService.deleteMine(user.id, id);
  }
}

@ApiTags("me")
@Controller("me/calendar.ics")
export class CalendarIcsController {
  constructor(private readonly calendarService: CalendarService) {}

  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: "Descarga/suscripción .ics de la agenda del usuario" })
  async downloadIcs(@CurrentUser() user: RequestUser, @Res() res: Response) {
    const ics = await this.calendarService.generateIcsForUser(user.id);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="inkademy.ics"');
    res.send(ics);
  }
}

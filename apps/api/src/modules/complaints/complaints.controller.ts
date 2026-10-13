import { Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { complaintSchema, type ComplaintInput } from "@inkademy/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import type { RequestUser } from "../../common/guards/jwt-auth.guard";
import { ComplaintsService } from "./complaints.service";

const respondSchema = z.object({ response: z.string().trim().min(10, "Escribe la respuesta al consumidor").max(4000) });

@ApiTags("complaints")
@UseGuards(RolesGuard)
@Controller()
export class ComplaintsController {
  constructor(private readonly service: ComplaintsService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @Post("public/complaints")
  @ApiOperation({ summary: "Registra un reclamo o queja en el Libro de Reclamaciones (sin sesión)" })
  create(@Body(new ZodValidationPipe(complaintSchema)) dto: ComplaintInput) {
    return this.service.create(dto);
  }

  @Roles("ADMIN", "SUPPORT")
  @Get("admin/complaints")
  @ApiOperation({ summary: "Reclamos y quejas con búsqueda (folio, consumidor, documento, correo, servicio), filtros, orden y paginación en el servidor" })
  list(@Query() query: Record<string, string>) {
    return this.service.list(
      { q: query.q, status: query.status, kind: query.kind, overdue: query.overdue, from: query.from, to: query.to },
      { page: query.page, pageSize: query.pageSize, sort: query.sort, dir: query.dir },
    );
  }

  @Roles("ADMIN", "SUPPORT")
  @Get("admin/complaints/summary")
  @ApiOperation({ summary: "Totales del libro: pendientes, con plazo vencido, respondidos (tarjetas de /admin/reclamos)" })
  summary() {
    return this.service.summary();
  }

  @Roles("ADMIN", "SUPPORT")
  @Get("admin/complaints/export.:format")
  @ApiOperation({ summary: "Descarga el libro filtrado en Excel (.xlsx) o CSV" })
  async exportBook(@CurrentUser() user: RequestUser, @Param("format") format: string, @Query() query: Record<string, string>, @Res() res: Response) {
    if (format !== "xlsx" && format !== "csv") throw new NotFoundException();
    const { buffer } = await this.service.export(
      { q: query.q, status: query.status, kind: query.kind, overdue: query.overdue, from: query.from, to: query.to },
      { sort: query.sort, dir: query.dir },
      format,
      { id: user.id, email: user.email },
    );
    const stamp = new Date().toLocaleString("sv-SE", { timeZone: "America/Lima" }).slice(0, 16).replace(" ", "_").replace(":", "");
    res.set({
      "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="libro-de-reclamaciones_${stamp}.${format}"`,
    });
    res.send(buffer);
  }

  @Roles("ADMIN", "SUPPORT")
  @Patch("admin/complaints/:id/respond")
  @ApiOperation({ summary: "Responde un reclamo o queja (se envía al consumidor por correo)" })
  respond(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body(new ZodValidationPipe(respondSchema)) dto: z.infer<typeof respondSchema>) {
    return this.service.respond(user.id, id, dto.response);
  }
}

import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
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
  @ApiOperation({ summary: "Reclamos y quejas registrados" })
  list(@Query("status") status?: string) {
    return this.service.list(status === "PENDING" || status === "RESPONDED" ? status : undefined);
  }

  @Roles("ADMIN", "SUPPORT")
  @Patch("admin/complaints/:id/respond")
  @ApiOperation({ summary: "Responde un reclamo o queja (se envía al consumidor por correo)" })
  respond(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body(new ZodValidationPipe(respondSchema)) dto: z.infer<typeof respondSchema>) {
    return this.service.respond(user.id, id, dto.response);
  }
}

import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { publicQuoteRequestSchema, type PublicQuoteRequestInput } from "@inkademy/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import type { RequestUser } from "../../common/guards/jwt-auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { QuoteLeadsService } from "./quote-leads.service";

const updateSchema = z.object({
  status: z.enum(["NEW", "CONTACTED", "CLOSED"]).optional(),
  internalNotes: z.string().max(3000).nullable().optional(),
});

@ApiTags("quote-leads")
@UseGuards(RolesGuard)
@Controller()
export class QuoteLeadsController {
  constructor(private readonly service: QuoteLeadsService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 600_000 } })
  @Post("public/quote-requests")
  @ApiOperation({ summary: "Solicitud pública de cotización de una empresa (sin sesión)" })
  create(@Body(new ZodValidationPipe(publicQuoteRequestSchema)) dto: PublicQuoteRequestInput) {
    return this.service.create(dto);
  }

  @Roles("ADMIN", "SUPPORT")
  @Get("admin/quote-leads")
  @ApiOperation({ summary: "Solicitudes de cotización recibidas del formulario público" })
  list(@Query("status") status?: string) {
    return this.service.list(status === "NEW" || status === "CONTACTED" || status === "CLOSED" ? status : undefined);
  }

  @Roles("ADMIN", "SUPPORT")
  @Patch("admin/quote-leads/:id")
  @ApiOperation({ summary: "Marca una solicitud como atendida/cerrada o agrega notas" })
  update(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body(new ZodValidationPipe(updateSchema)) dto: z.infer<typeof updateSchema>) {
    return this.service.update(user.id, id, dto);
  }
}

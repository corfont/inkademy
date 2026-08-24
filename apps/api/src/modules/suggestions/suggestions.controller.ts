import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import type { RequestUser } from "../../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { createSuggestionSchema, updateSuggestionSchema } from "../../common/validation/local-schemas";
import { SuggestionsService } from "./suggestions.service";

/**
 * A propósito separado de SupportTicket: una sugerencia ("me gustaría un
 * curso de...") no es un problema a resolver con SLA/estado de ticket, es
 * una idea a evaluar para el catálogo futuro — antes no había ningún lugar
 * para dejar este tipo de comentario.
 */
@ApiTags("suggestions")
@ApiBearerAuth()
@Controller("suggestions")
export class SuggestionsController {
  constructor(private readonly suggestionsService: SuggestionsService) {}

  @Post()
  @ApiOperation({ summary: "Envía una sugerencia (ej. un curso que te gustaría que exista)" })
  create(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(createSuggestionSchema)) dto: { message: string }) {
    return this.suggestionsService.create(user.id, dto.message);
  }

  @Get("mine")
  @ApiOperation({ summary: "Mis sugerencias enviadas" })
  listMine(@CurrentUser() user: RequestUser) {
    return this.suggestionsService.listMine(user.id);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Todas las sugerencias (admin/soporte)" })
  listAll() {
    return this.suggestionsService.listAll();
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Cambia el estado de una sugerencia" })
  updateStatus(@Param("id") id: string, @Body(new ZodValidationPipe(updateSuggestionSchema)) dto: { status: string }) {
    return this.suggestionsService.updateStatus(id, dto.status);
  }
}

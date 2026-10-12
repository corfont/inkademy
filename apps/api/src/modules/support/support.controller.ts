import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createSupportTicketSchema } from "@inkademy/shared";
import type { CreateSupportTicketInput } from "@inkademy/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import type { RequestUser } from "../../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { addSupportMessageSchema, updateTicketAttentionSchema } from "../../common/validation/local-schemas";
import { SupportService } from "./support.service";

function isGlobalStaff(user: RequestUser) {
  return user.globalRole === "ADMIN" || user.globalRole === "SUPPORT";
}

@ApiTags("support")
@ApiBearerAuth()
@Controller("support/tickets")
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post()
  @ApiOperation({ summary: "Crea un ticket de soporte" })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createSupportTicketSchema)) dto: CreateSupportTicketInput,
  ) {
    return this.supportService.createTicket(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: "Lista mis tickets, o los de mi empresa si soy COMPANY_ADMIN" })
  list(@CurrentUser() user: RequestUser, @Query("companyId") companyId?: string) {
    return this.supportService.listMine(user.id, companyId, isGlobalStaff(user));
  }

  @Get("pending-count")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Cantidad de tickets sin ninguna respuesta todavía — para el indicador del menú" })
  countPending() {
    return this.supportService.countPending();
  }

  @Get("staff")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Personas que pueden ser responsables de un ticket" })
  staff() {
    return this.supportService.listStaff();
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Cambia el estado, el responsable o el plazo de atención de un ticket" })
  updateAttention(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateTicketAttentionSchema)) dto: { status?: "OPEN" | "IN_PROGRESS" | "WAITING_USER" | "RESOLVED" | "CLOSED"; assigneeId?: string | null; dueAt?: string | null },
  ) {
    return this.supportService.updateAttention(user.id, id, dto);
  }

  @Get(":id")
  @ApiOperation({ summary: "Detalle de un ticket con sus mensajes" })
  get(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.supportService.getTicket(user.id, id, isGlobalStaff(user));
  }

  @Post(":id/messages")
  @ApiOperation({ summary: "Agrega un mensaje al ticket" })
  addMessage(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addSupportMessageSchema)) dto: { body: string },
  ) {
    return this.supportService.addMessage(user.id, id, dto.body, isGlobalStaff(user));
  }

  @Post(":id/suggest-reply")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Borrador de respuesta con IA para que soporte lo revise antes de enviarlo" })
  suggestReply(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.supportService.suggestReply(user.id, id, isGlobalStaff(user));
  }

  @Post(":id/save-as-knowledge")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Guarda el ticket (pregunta + respuesta correcta) como fuente del asistente de IA" })
  saveAsKnowledge(@Param("id") id: string) {
    return this.supportService.saveAsKnowledge(id);
  }
}

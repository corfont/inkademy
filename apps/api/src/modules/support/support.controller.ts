import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createSupportTicketSchema } from "@inkademy/shared";
import type { CreateSupportTicketInput } from "@inkademy/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { RequestUser } from "../../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { addSupportMessageSchema } from "../../common/validation/local-schemas";
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
}

import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { submitNpsResponseSchema, updateNpsQuestionSchema } from "@inkademy/shared";
import type { SubmitNpsResponseInput, UpdateNpsQuestionInput } from "@inkademy/shared";
import { Public } from "../../common/decorators/public.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { NpsService } from "./nps.service";

@ApiTags("admin-nps")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles("ADMIN")
@Controller("admin/nps")
export class NpsAdminController {
  constructor(private readonly nps: NpsService) {}

  @Get("question")
  @ApiOperation({ summary: "Pregunta única de la encuesta NPS (la define el admin)" })
  getQuestion() {
    return this.nps.getQuestion();
  }

  @Put("question")
  @ApiOperation({ summary: "Actualiza la pregunta de la encuesta NPS" })
  updateQuestion(@Body(new ZodValidationPipe(updateNpsQuestionSchema)) dto: UpdateNpsQuestionInput) {
    return this.nps.updateQuestion(dto.question);
  }

  @Get("companies")
  @ApiOperation({ summary: "Empresas con el estado de su último envío de encuesta" })
  listCompanies() {
    return this.nps.listCompaniesWithLastSend();
  }

  @Post("send/:companyId")
  @ApiOperation({ summary: "Envía la encuesta NPS al administrador de esa empresa" })
  send(@Param("companyId") companyId: string) {
    return this.nps.sendToCompany(companyId);
  }

  @Get("responses")
  @ApiOperation({ summary: "Resultados agregados (score NPS) + comentarios" })
  listResponses(@Query("companyId") companyId?: string) {
    return this.nps.listResponses(companyId);
  }
}

@ApiTags("nps")
@Controller("nps")
export class NpsPublicController {
  constructor(private readonly nps: NpsService) {}

  @Public()
  @Get(":token")
  @ApiOperation({ summary: "Pregunta de la encuesta para un envío puntual (sin login, vía token)" })
  getByToken(@Param("token") token: string) {
    return this.nps.getByToken(token);
  }

  @Public()
  @Post(":token")
  @ApiOperation({ summary: "Responde la encuesta NPS (sin login)" })
  submit(@Param("token") token: string, @Body(new ZodValidationPipe(submitNpsResponseSchema)) dto: SubmitNpsResponseInput) {
    return this.nps.submitResponse(token, dto.score, dto.comment);
  }
}

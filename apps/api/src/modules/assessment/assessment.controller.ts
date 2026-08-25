import { Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { submitAttemptSchema } from "@inkademy/shared";
import type { AssessmentAttemptSubmission } from "@inkademy/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { RequestUser } from "../../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { submitFileAttemptSchema } from "../../common/validation/local-schemas";
import { AssessmentService } from "./assessment.service";

@ApiTags("assessments")
@ApiBearerAuth()
@Controller("assessments")
export class AssessmentController {
  constructor(private readonly assessmentService: AssessmentService) {}

  @Get(":id")
  @ApiOperation({ summary: "Preguntas de una evaluación (sin correctAnswer, orden según config)" })
  getAssessment(@Param("id") id: string) {
    return this.assessmentService.getForStudent(id);
  }

  @Post(":id/attempts")
  @ApiOperation({ summary: "Inicia un nuevo intento (valida matrícula, fechas e intentos restantes)" })
  createAttempt(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.assessmentService.createAttempt(id, user.id);
  }
}

@ApiTags("attempts")
@ApiBearerAuth()
@Controller("attempts")
export class AttemptsController {
  constructor(private readonly assessmentService: AssessmentService) {}

  @Post(":id/submit")
  @ApiOperation({ summary: "Envía respuestas: autocorrige objetivas, abiertas quedan PENDING_REVIEW" })
  submit(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(submitAttemptSchema)) dto: AssessmentAttemptSubmission,
  ) {
    return this.assessmentService.submitAttempt(id, user.id, dto);
  }

  @Post("uploads")
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "El alumno sube su archivo de respuesta para un examen 'cualitativo' (Word/Excel/PPT/imagen/PDF)" })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 50 * 1024 * 1024 } }))
  uploadSubmission(@UploadedFile() file: { originalname: string; buffer: Buffer; mimetype: string }) {
    return this.assessmentService.uploadSubmissionFile(file);
  }

  @Post(":id/submit-file")
  @ApiOperation({ summary: "Envía un examen 'cualitativo': sube un archivo como respuesta completa, queda pendiente de calificación manual" })
  submitFile(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(submitFileAttemptSchema)) dto: { submissionAssetId: string; submissionMimeType: string },
  ) {
    return this.assessmentService.submitFileAttempt(id, user.id, dto);
  }

  @Get(":id")
  @ApiOperation({ summary: "Estado/resultado de un intento" })
  get(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.assessmentService.getAttempt(id, user.id, user.globalRole === "ADMIN" || user.globalRole === "TEACHER");
  }
}

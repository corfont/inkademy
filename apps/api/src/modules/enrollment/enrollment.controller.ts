import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { EnrollmentStatus } from "@inkademy/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { RequestUser } from "../../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { updateLessonProgressSchema, upsertLessonNoteSchema } from "../../common/validation/local-schemas";
import { EnrollmentService } from "./enrollment.service";

@ApiTags("me")
@ApiBearerAuth()
@Controller("me")
export class EnrollmentController {
  constructor(private readonly enrollmentService: EnrollmentService) {}

  @Get("enrollments")
  @ApiOperation({ summary: "Mis matrículas (cursos y programas)" })
  listMine(@CurrentUser() user: RequestUser, @Query("status") status?: EnrollmentStatus) {
    return this.enrollmentService.listMine(user.id, status);
  }

  @Get("enrollments/:id")
  @ApiOperation({ summary: "Detalle de una matrícula: módulos, lecciones y progreso" })
  getMineDetail(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.enrollmentService.getMineDetail(user.id, id);
  }

  @Patch("lessons/:lessonId/progress")
  @ApiOperation({ summary: "Actualiza el progreso de una lección y recalcula progressPct" })
  updateLessonProgress(
    @CurrentUser() user: RequestUser,
    @Param("lessonId") lessonId: string,
    @Body(new ZodValidationPipe(updateLessonProgressSchema))
    dto: { completed?: boolean; lastPositionSeconds?: number },
  ) {
    return this.enrollmentService.updateLessonProgress(user.id, lessonId, dto);
  }

  @Get("lessons/:lessonId/notes")
  @ApiOperation({ summary: "Mi nota personal sobre esta lección (antes vivía solo en localStorage)" })
  getLessonNote(@CurrentUser() user: RequestUser, @Param("lessonId") lessonId: string) {
    return this.enrollmentService.getLessonNote(user.id, lessonId);
  }

  @Patch("lessons/:lessonId/notes")
  @ApiOperation({ summary: "Guarda mi nota personal sobre esta lección" })
  upsertLessonNote(
    @CurrentUser() user: RequestUser,
    @Param("lessonId") lessonId: string,
    @Body(new ZodValidationPipe(upsertLessonNoteSchema)) dto: { content: string },
  ) {
    return this.enrollmentService.upsertLessonNote(user.id, lessonId, dto.content);
  }

  @Get("recommendations")
  @ApiOperation({ summary: "Cursos recomendados para el usuario, con motivo" })
  listRecommendations(@CurrentUser() user: RequestUser) {
    return this.enrollmentService.listRecommendations(user.id);
  }
}

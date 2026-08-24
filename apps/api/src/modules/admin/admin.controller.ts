import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import type { RequestUser } from "../../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import {
  gradeAnswerSchema,
  updateCourseSchema,
  updateCertificateTemplateSchema,
  updateLessonSchema,
  updateModuleSchema,
  updateProgramSchema,
  upsertAreaSchema,
  upsertCertificateTemplateSchema,
  upsertCourseSchema,
  upsertLessonSchema,
  upsertMaterialSchema,
  upsertModuleSchema,
  upsertProgramSchema,
} from "../../common/validation/local-schemas";
import { AssessmentService } from "../assessment/assessment.service";
import { AdminService } from "./admin.service";

@ApiTags("admin")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller("admin")
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly assessmentService: AssessmentService,
  ) {}

  @Get("dashboard/kpis")
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "KPIs de ventas, inscripciones, alumnos y certificados" })
  kpis() {
    return this.adminService.getKpis();
  }

  @Get("exceptions")
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Cola de excepciones operativas (trabajo por excepción)" })
  exceptions() {
    return this.adminService.getExceptions();
  }

  @Get("areas")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Lista áreas (admin)" })
  listAreas() {
    return this.adminService.listAreas();
  }

  @Post("areas")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Crea un área" })
  createArea(@Body(new ZodValidationPipe(upsertAreaSchema)) dto: any) {
    return this.adminService.createArea(dto);
  }

  @Patch("areas/:id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Actualiza un área" })
  updateArea(@Param("id") id: string, @Body() dto: any) {
    return this.adminService.updateArea(id, dto);
  }

  @Get("courses")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Lista cursos (admin, incluye DRAFT/ARCHIVED)" })
  listCourses(@Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    return this.adminService.listCourses({ page: Number(page) || undefined, pageSize: Number(pageSize) || undefined });
  }

  @Post("courses")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Crea un curso" })
  createCourse(@Body(new ZodValidationPipe(upsertCourseSchema)) dto: any) {
    return this.adminService.createCourse(dto);
  }

  @Patch("courses/:id")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Actualiza un curso" })
  updateCourse(@Param("id") id: string, @Body(new ZodValidationPipe(updateCourseSchema)) dto: any) {
    return this.adminService.updateCourse(id, dto);
  }

  @Get("courses/:id")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Detalle de un curso: metadata + módulos/lecciones/materiales + sesiones en vivo" })
  getCourse(@Param("id") id: string) {
    return this.adminService.getCourseDetail(id);
  }

  @Post("courses/:courseId/modules")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Crea un módulo dentro de un curso" })
  createModule(@Param("courseId") courseId: string, @Body(new ZodValidationPipe(upsertModuleSchema)) dto: any) {
    return this.adminService.createModule(courseId, dto);
  }

  @Patch("modules/:id")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Actualiza un módulo (título/orden)" })
  updateModule(@Param("id") id: string, @Body(new ZodValidationPipe(updateModuleSchema)) dto: any) {
    return this.adminService.updateModule(id, dto);
  }

  @Delete("modules/:id")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Elimina un módulo (y sus lecciones/materiales en cascada)" })
  deleteModule(@Param("id") id: string) {
    return this.adminService.deleteModule(id);
  }

  @Post("modules/:moduleId/lessons")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Crea una lección dentro de un módulo" })
  createLesson(@Param("moduleId") moduleId: string, @Body(new ZodValidationPipe(upsertLessonSchema)) dto: any) {
    return this.adminService.createLesson(moduleId, dto);
  }

  @Patch("lessons/:id")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Actualiza una lección" })
  updateLesson(@Param("id") id: string, @Body(new ZodValidationPipe(updateLessonSchema)) dto: any) {
    return this.adminService.updateLesson(id, dto);
  }

  @Delete("lessons/:id")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Elimina una lección (y sus materiales en cascada)" })
  deleteLesson(@Param("id") id: string) {
    return this.adminService.deleteLesson(id);
  }

  @Post("lessons/:lessonId/materials")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Agrega un material (PDF/plantilla/link) a una lección" })
  createMaterial(@Param("lessonId") lessonId: string, @Body(new ZodValidationPipe(upsertMaterialSchema)) dto: any) {
    return this.adminService.createMaterial(lessonId, dto);
  }

  @Delete("materials/:id")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Elimina un material" })
  deleteMaterial(@Param("id") id: string) {
    return this.adminService.deleteMaterial(id);
  }

  @Post("uploads")
  @Roles("ADMIN", "TEACHER")
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Sube un archivo (video/PDF/portada) a S3/MinIO y devuelve su assetId" })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 50 * 1024 * 1024 } }))
  uploadAsset(@UploadedFile() file: { originalname: string; buffer: Buffer; mimetype: string }) {
    return this.adminService.uploadAsset(file);
  }

  @Get("programs")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Lista programas/diplomados (admin)" })
  listPrograms() {
    return this.adminService.listPrograms();
  }

  @Post("programs")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Crea un programa/diplomado" })
  createProgram(@Body(new ZodValidationPipe(upsertProgramSchema)) dto: any) {
    return this.adminService.createProgram(dto);
  }

  @Patch("programs/:id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Actualiza un programa/diplomado" })
  updateProgram(@Param("id") id: string, @Body(new ZodValidationPipe(updateProgramSchema)) dto: any) {
    return this.adminService.updateProgram(id, dto);
  }

  @Get("attempts/pending-review")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Cola de preguntas abiertas/cortas por calificar" })
  pendingReview() {
    return this.assessmentService.listPendingReview();
  }

  @Post("attempts/:attemptId/answers/:answerId/grade")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Califica una respuesta abierta/corta" })
  gradeAnswer(
    @CurrentUser() user: RequestUser,
    @Param("attemptId") attemptId: string,
    @Param("answerId") answerId: string,
    @Body(new ZodValidationPipe(gradeAnswerSchema)) dto: { score: number; isCorrect: boolean },
  ) {
    return this.assessmentService.gradeAnswer(attemptId, answerId, user.id, dto);
  }

  @Get("certificate-templates")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Lista plantillas de certificado" })
  listCertificateTemplates() {
    return this.adminService.listCertificateTemplates();
  }

  @Post("certificate-templates")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Crea una nueva versión de plantilla de certificado" })
  createCertificateTemplate(@Body(new ZodValidationPipe(upsertCertificateTemplateSchema)) dto: any) {
    return this.adminService.createCertificateTemplate(dto);
  }

  @Patch("certificate-templates/:id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Edita el HTML o activa/desactiva una plantilla de certificado" })
  updateCertificateTemplate(@Param("id") id: string, @Body(new ZodValidationPipe(updateCertificateTemplateSchema)) dto: any) {
    return this.adminService.updateCertificateTemplate(id, dto);
  }

  @Get("companies")
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Lista todas las empresas" })
  listCompanies() {
    return this.adminService.listCompanies();
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import type { RequestUser } from "../../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import {
  assignCourseStaffSchema,
  adminResetPasswordSchema,
  createUserSchema,
  gradeAnswerSchema,
  updateAssessmentSchema,
  updateCourseSchema,
  updateCertificateTemplateSchema,
  updateLessonSchema,
  updateMaterialSchema,
  updateModuleSchema,
  updateProgramSchema,
  updateQuestionSchema,
  updateUserSchema,
  upsertAreaSchema,
  upsertAssessmentSchema,
  upsertCertificateTemplateSchema,
  upsertCourseSchema,
  upsertLessonSchema,
  upsertMaterialSchema,
  upsertModuleSchema,
  upsertProgramSchema,
  upsertQuestionSchema,
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

  @Get("dashboard/kpi-charts")
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Series de tiempo y distribuciones para los gráficos del dashboard" })
  kpiCharts() {
    return this.adminService.getKpiCharts();
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
  @ApiOperation({ summary: "Lista cursos (admin, incluye DRAFT/ARCHIVED) — TEACHER solo ve los cursos donde es CourseStaff" })
  listCourses(@CurrentUser() user: RequestUser, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    return this.adminService.listCourses(
      { page: Number(page) || undefined, pageSize: Number(pageSize) || undefined },
      user.globalRole === "TEACHER" ? user.id : undefined,
    );
  }

  @Get("my-courses")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Resumen del panel de docente: cursos asignados, próximas sesiones en vivo a dictar, evaluaciones pendientes" })
  myTeachingSummary(@CurrentUser() user: RequestUser) {
    return this.adminService.getTeacherDashboard(user.id);
  }

  @Post("courses")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Crea un curso" })
  createCourse(@Body(new ZodValidationPipe(upsertCourseSchema)) dto: any) {
    return this.adminService.createCourse(dto);
  }

  @Patch("courses/:id")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Actualiza un curso — TEACHER solo si es CourseStaff de ese curso" })
  updateCourse(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body(new ZodValidationPipe(updateCourseSchema)) dto: any) {
    return this.adminService.updateCourse(id, dto, user.globalRole === "TEACHER" ? user.id : undefined);
  }

  @Get("courses/:id")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Detalle de un curso: metadata + módulos/lecciones/materiales + sesiones en vivo — TEACHER solo si es CourseStaff de ese curso" })
  getCourse(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.adminService.getCourseDetail(id, user.globalRole === "TEACHER" ? user.id : undefined);
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
  @ApiOperation({ summary: "Agrega un material (PDF/Word/Excel/imagen/video/link) a una lección" })
  createMaterial(@Param("lessonId") lessonId: string, @Body(new ZodValidationPipe(upsertMaterialSchema)) dto: any) {
    return this.adminService.createMaterial(lessonId, dto);
  }

  @Post("modules/:moduleId/materials")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Agrega una lectura/documento (principal o complementario) a nivel de módulo completo" })
  createModuleMaterial(@Param("moduleId") moduleId: string, @Body(new ZodValidationPipe(upsertMaterialSchema)) dto: any) {
    return this.adminService.createModuleMaterial(moduleId, dto);
  }

  @Patch("materials/:id")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Actualiza un material (p.ej. mostrar/ocultar al alumno, cambiar categoría principal/complementario)" })
  updateMaterial(@Param("id") id: string, @Body(new ZodValidationPipe(updateMaterialSchema)) dto: any) {
    return this.adminService.updateMaterial(id, dto);
  }

  @Delete("materials/:id")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Elimina un material" })
  deleteMaterial(@Param("id") id: string) {
    return this.adminService.deleteMaterial(id);
  }

  // --- Evaluaciones (exámenes/quizzes) y sus preguntas — TEACHER solo en cursos donde es CourseStaff ---

  @Get("courses/:courseId/assessments")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Lista las evaluaciones de un curso, con sus preguntas" })
  listAssessments(@CurrentUser() user: RequestUser, @Param("courseId") courseId: string) {
    return this.assessmentService.listForCourse(courseId, user.globalRole === "TEACHER" ? user.id : undefined);
  }

  @Post("courses/:courseId/assessments")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Crea una evaluación (examen/quiz) para un curso" })
  createAssessment(
    @CurrentUser() user: RequestUser,
    @Param("courseId") courseId: string,
    @Body(new ZodValidationPipe(upsertAssessmentSchema)) dto: any,
  ) {
    return this.assessmentService.createAssessment(courseId, dto, user.globalRole === "TEACHER" ? user.id : undefined);
  }

  @Patch("assessments/:id")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Actualiza las reglas de una evaluación" })
  updateAssessment(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateAssessmentSchema)) dto: any,
  ) {
    return this.assessmentService.updateAssessment(id, dto, user.globalRole === "TEACHER" ? user.id : undefined);
  }

  @Delete("assessments/:id")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Elimina una evaluación (falla si ya tiene intentos de alumnos)" })
  deleteAssessment(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.assessmentService.deleteAssessment(id, user.globalRole === "TEACHER" ? user.id : undefined);
  }

  @Post("assessments/:assessmentId/questions")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Agrega una pregunta a una evaluación" })
  createQuestion(
    @CurrentUser() user: RequestUser,
    @Param("assessmentId") assessmentId: string,
    @Body(new ZodValidationPipe(upsertQuestionSchema)) dto: any,
  ) {
    return this.assessmentService.createQuestion(assessmentId, dto, user.globalRole === "TEACHER" ? user.id : undefined);
  }

  @Patch("questions/:id")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Actualiza una pregunta" })
  updateQuestion(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateQuestionSchema)) dto: any,
  ) {
    return this.assessmentService.updateQuestion(id, dto, user.globalRole === "TEACHER" ? user.id : undefined);
  }

  @Delete("questions/:id")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Elimina una pregunta" })
  deleteQuestion(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.assessmentService.deleteQuestion(id, user.globalRole === "TEACHER" ? user.id : undefined);
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
  @ApiOperation({ summary: "Cola de preguntas abiertas/cortas por calificar (TEACHER ve solo sus cursos, ADMIN/SUPPORT ve todo)" })
  pendingReview(@CurrentUser() user: RequestUser) {
    return this.assessmentService.listPendingReview(user.globalRole === "TEACHER" ? user.id : undefined);
  }

  @Get("attempts/suspicious")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Intentos marcados como posible trampa/uso de IA (nota alta + tiempo de resolución muy corto)" })
  suspiciousAttempts(@CurrentUser() user: RequestUser) {
    return this.assessmentService.listSuspiciousAttempts(user.globalRole === "TEACHER" ? user.id : undefined);
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

  @Get("orders")
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Busca órdenes por id, email del comprador o razón social (para ubicarlas y cancelarlas)" })
  listOrders(@Query("q") q?: string) {
    return this.adminService.listOrders(q);
  }

  // --- Usuarios y roles ---

  @Get("users")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Lista/busca cuentas de usuario (todas, sin importar el rol)" })
  listUsers(@Query("q") q?: string, @Query("role") role?: string) {
    return this.adminService.listUsers({ q, role });
  }

  @Post("users")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Crea una cuenta directamente (docente/soporte/otro admin) — devuelve una contraseña temporal una sola vez" })
  createUser(@Body(new ZodValidationPipe(createUserSchema)) dto: any) {
    return this.adminService.createUser(dto);
  }

  @Patch("users/:id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Cambia el rol y/o activa/desactiva una cuenta" })
  updateUser(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body(new ZodValidationPipe(updateUserSchema)) dto: any) {
    return this.adminService.updateUser(id, user.id, dto);
  }

  @Post("users/:id/reset-password")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Resetea la contraseña de un usuario que lo pidió — sin contraseña en el body, genera una temporal" })
  resetUserPassword(@Param("id") id: string, @Body(new ZodValidationPipe(adminResetPasswordSchema)) dto: { password?: string }) {
    return this.adminService.resetUserPassword(id, dto.password);
  }

  @Delete("users/:id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Elimina una cuenta (rechaza si tiene órdenes/certificados/matrículas — desactívala en su lugar)" })
  deleteUser(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.adminService.deleteUser(id, user.id);
  }

  // --- Docentes asignados a un curso ---

  @Get("courses/:courseId/staff")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Docentes/moderadores asignados a un curso" })
  listCourseStaff(@Param("courseId") courseId: string) {
    return this.adminService.listCourseStaff(courseId);
  }

  @Post("courses/:courseId/staff")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Asigna un docente/moderador a un curso (busca por correo)" })
  assignCourseStaff(@Param("courseId") courseId: string, @Body(new ZodValidationPipe(assignCourseStaffSchema)) dto: any) {
    return this.adminService.assignCourseStaff(courseId, dto);
  }

  @Delete("course-staff/:id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Quita a un docente/moderador de un curso" })
  removeCourseStaff(@Param("id") id: string) {
    return this.adminService.removeCourseStaff(id);
  }
}

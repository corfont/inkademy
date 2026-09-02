import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import type { Response } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import type { RequestUser } from "../../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { teacherScopeId } from "../../common/utils/scope";
import { fileMimeFilter, COURSE_ASSET_MIME_PREFIXES, DOCUMENT_MIME_PREFIXES } from "../../common/utils/file-filter";
import { ScormService } from "../scorm/scorm.service";
import {
  addCoursePartnershipSchema,
  updateCoursePartnershipSchema,
  addCourseRoyaltySchema,
  assignCourseStaffSchema,
  adminResetPasswordSchema,
  bulkIdsSchema,
  scormAuthoredContentSchema,
  upsertScormThemePresetSchema,
  createExpenseSchema,
  createTeacherActivityLogSchema,
  createTeacherAdvanceSchema,
  createUserSchema,
  deleteCourtesyGrantsSchema,
  generateTeacherLiquidationSchema,
  gradeFileAttemptSchema,
  emailAudienceFilterSchema,
  upsertEmailCampaignSchema,
  updateEmailCampaignSchema,
  upsertMailingListSchema,
  updateMailingListSchema,
  upsertPartnerInstitutionSchema,
  upsertRoyaltyRecipientSchema,
  upsertTeacherRateSchema,
  waiveLiquidationSchema,
  extendEnrollmentAccessSchema,
  resetEnrollmentProgressSchema,
  gradeAnswerSchema,
  updateAssessmentSchema,
  updateCourseSchema,
  updateCertificateTemplateSchema,
  updateLessonSchema,
  updateMaterialSchema,
  updateModuleSchema,
  updateApprovalRuleSchema,
  updateFeeSettingsSchema,
  updateProgramSchema,
  updateQuestionSchema,
  updateUserSchema,
  reorderQuestionsSchema,
  reorderAssessmentsSchema,
  reorderModulesSchema,
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
import { respondToQuoteSchema } from "@inkademy/shared";
import { AssessmentService } from "../assessment/assessment.service";
import { EnrollmentService } from "../enrollment/enrollment.service";
import { CompaniesService } from "../companies/companies.service";
import { AdminService } from "./admin.service";

@ApiTags("admin")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller("admin")
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly assessmentService: AssessmentService,
    private readonly enrollmentService: EnrollmentService,
    private readonly companiesService: CompaniesService,
    private readonly scormService: ScormService,
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
  listCourses(
    @CurrentUser() user: RequestUser,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    // "He entrado como docente y me aparecen todos los cursos" — quien
    // también tiene ADMIN/SUPPORT como rol secundario cae en la rama "sin
    // restricción" de teacherScopeId (correcto para /admin/catalogo). Este
    // flag lo fuerza a "solo lo mío" para /docente/cursos, sin tocar el
    // comportamiento de /admin/catalogo.
    @Query("mine") mine?: string,
  ) {
    const teacherId = mine === "true" && user.roles.includes("TEACHER") ? user.id : teacherScopeId(user);
    return this.adminService.listCourses({ page: Number(page) || undefined, pageSize: Number(pageSize) || undefined }, teacherId);
  }

  @Get("my-courses")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Resumen del panel de docente: cursos asignados, próximas sesiones en vivo a dictar, evaluaciones pendientes" })
  myTeachingSummary(@CurrentUser() user: RequestUser) {
    return this.adminService.getTeacherDashboard(user.id);
  }

  @Get("my-agenda")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Agenda completa del docente: todas las sesiones en vivo de sus cursos asignados" })
  myAgenda(@CurrentUser() user: RequestUser) {
    return this.adminService.getTeacherAgenda(user.id);
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
    return this.adminService.updateCourse(id, dto, teacherScopeId(user));
  }

  @Get("courses/:id")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Detalle de un curso: metadata + módulos/lecciones/materiales + sesiones en vivo — TEACHER solo si es CourseStaff de ese curso" })
  getCourse(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.adminService.getCourseDetail(id, teacherScopeId(user));
  }

  @Get("courses/:id/attendance-report")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Lista de inscritos + asistencia por sesión en vivo — TEACHER solo si es CourseStaff de ese curso" })
  getAttendanceReport(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.adminService.getAttendanceReport(id, teacherScopeId(user));
  }

  @Get("courses/:id/approval-rule")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Regla de habilitación de certificado del curso (nota mínima, % de avance, asistencia, tarea)" })
  getApprovalRule(@Param("id") id: string) {
    return this.adminService.getApprovalRule(id);
  }

  @Patch("courses/:id/approval-rule")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Configura la regla de habilitación de certificado del curso" })
  updateApprovalRule(@Param("id") id: string, @Body(new ZodValidationPipe(updateApprovalRuleSchema)) dto: any) {
    return this.adminService.updateApprovalRule(id, dto);
  }

  @Post("courses/:courseId/modules")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Crea un módulo dentro de un curso — TEACHER solo si es CourseStaff de ese curso" })
  createModule(@CurrentUser() user: RequestUser, @Param("courseId") courseId: string, @Body(new ZodValidationPipe(upsertModuleSchema)) dto: any) {
    return this.adminService.createModule(courseId, dto, teacherScopeId(user));
  }

  @Patch("modules/:id")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Actualiza un módulo (título/orden) — TEACHER solo si es CourseStaff del curso dueño" })
  updateModule(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body(new ZodValidationPipe(updateModuleSchema)) dto: any) {
    return this.adminService.updateModule(id, dto, teacherScopeId(user));
  }

  @Delete("modules/:id")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Elimina un módulo (y sus lecciones/materiales en cascada) — TEACHER solo si es CourseStaff del curso dueño" })
  deleteModule(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.adminService.deleteModule(id, teacherScopeId(user));
  }

  // "Es muy complicado... no drag and drop" — antes no había ninguna forma de reordenar módulos.
  @Patch("courses/:courseId/modules/reorder")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Reordena los módulos de un curso (drag-and-drop)" })
  reorderModules(
    @CurrentUser() user: RequestUser,
    @Param("courseId") courseId: string,
    @Body(new ZodValidationPipe(reorderModulesSchema)) dto: { orderedModuleIds: string[] },
  ) {
    return this.adminService.reorderModules(courseId, dto.orderedModuleIds, teacherScopeId(user));
  }

  @Post("modules/:moduleId/lessons")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Crea una lección dentro de un módulo — TEACHER solo si es CourseStaff del curso dueño" })
  createLesson(@CurrentUser() user: RequestUser, @Param("moduleId") moduleId: string, @Body(new ZodValidationPipe(upsertLessonSchema)) dto: any) {
    return this.adminService.createLesson(moduleId, dto, teacherScopeId(user));
  }

  @Patch("lessons/:id")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Actualiza una lección — TEACHER solo si es CourseStaff del curso dueño" })
  updateLesson(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body(new ZodValidationPipe(updateLessonSchema)) dto: any) {
    return this.adminService.updateLesson(id, dto, teacherScopeId(user));
  }

  @Delete("lessons/:id")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Elimina una lección (y sus materiales en cascada) — TEACHER solo si es CourseStaff del curso dueño" })
  deleteLesson(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.adminService.deleteLesson(id, teacherScopeId(user));
  }

  @Post("lessons/:id/scorm-upload")
  @Roles("ADMIN", "TEACHER")
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Sube un paquete SCORM (.zip) para esta lección — TEACHER solo si es CourseStaff del curso dueño" })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 200 * 1024 * 1024 },
      fileFilter: fileMimeFilter(["application/zip", "application/x-zip-compressed", "application/octet-stream"]),
    }),
  )
  uploadScormPackage(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @UploadedFile() file: { originalname: string; buffer: Buffer; mimetype: string },
  ) {
    return this.scormService.ingestPackage(id, file.buffer, teacherScopeId(user));
  }

  @Post("lessons/:id/scorm/build")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Genera un paquete SCORM real a partir de diapositivas armadas con el editor de autoría (sin subir ningún .zip)" })
  buildScormPackage(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(scormAuthoredContentSchema)) dto: any,
  ) {
    return this.scormService.buildFromAuthoredContent(id, dto, teacherScopeId(user));
  }

  @Post("lessons/:id/scorm/preview-session")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Sesión de prueba para reproducir el paquete SCORM sin matricularse (no guarda ningún progreso)" })
  async createScormPreviewSession(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    const { token } = await this.scormService.createPreviewSession(user.id, id, teacherScopeId(user));
    return { token, playerUrl: `/scorm/player/${encodeURIComponent(token)}` };
  }

  @Get("lessons/:id/scorm/export")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Descarga el paquete SCORM (.zip real, reutilizable en cualquier otro LMS)" })
  async exportScormPackage(@CurrentUser() user: RequestUser, @Param("id") id: string, @Res() res: Response) {
    const buffer = await this.scormService.exportPackageZip(id, teacherScopeId(user));
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="scorm-${id}.zip"`,
    });
    res.send(buffer);
  }

  @Get("lessons/:id/scorm/analytics")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Analítica por pregunta (cmi.interactions) agregada de todos los intentos de esta lección SCORM" })
  getScormAnalytics(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.scormService.getAnalytics(id, teacherScopeId(user));
  }

  // "SCORM ya existe pero solo como contenido principal de la lección" —
  // mismas 5 rutas de arriba, pero apuntando a un Material (adjunto
  // complementario) en vez de a la Lección entera.
  @Post("materials/:id/scorm-upload")
  @Roles("ADMIN", "TEACHER")
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Sube un paquete SCORM (.zip) para este material — TEACHER solo si puede editar el curso dueño" })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 200 * 1024 * 1024 },
      fileFilter: fileMimeFilter(["application/zip", "application/x-zip-compressed", "application/octet-stream"]),
    }),
  )
  uploadMaterialScormPackage(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @UploadedFile() file: { originalname: string; buffer: Buffer; mimetype: string },
  ) {
    return this.scormService.ingestMaterialPackage(id, file.buffer, teacherScopeId(user));
  }

  @Post("materials/:id/scorm/build")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Genera un paquete SCORM para este material a partir de diapositivas armadas con el editor de autoría" })
  buildMaterialScormPackage(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(scormAuthoredContentSchema)) dto: any,
  ) {
    return this.scormService.buildMaterialFromAuthoredContent(id, dto, teacherScopeId(user));
  }

  @Post("materials/:id/scorm/preview-session")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Sesión de prueba para reproducir el paquete SCORM de este material sin matricularse" })
  async createMaterialScormPreviewSession(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    const { token } = await this.scormService.createMaterialPreviewSession(user.id, id, teacherScopeId(user));
    return { token, playerUrl: `/scorm/player/${encodeURIComponent(token)}` };
  }

  @Get("materials/:id/scorm/export")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Descarga el paquete SCORM de este material (.zip real)" })
  async exportMaterialScormPackage(@CurrentUser() user: RequestUser, @Param("id") id: string, @Res() res: Response) {
    const buffer = await this.scormService.exportMaterialPackageZip(id, teacherScopeId(user));
    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="scorm-material-${id}.zip"`,
    });
    res.send(buffer);
  }

  @Get("materials/:id/scorm/analytics")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Analítica por pregunta agregada de todos los intentos del SCORM de este material" })
  getMaterialScormAnalytics(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.scormService.getMaterialAnalytics(id, teacherScopeId(user));
  }

  // "¿Colores, tipos de letra, tamaño, como lo hacen los mejores?" — brand
  // kit reutilizable del editor de autoría SCORM (catálogo global).
  @Get("scorm-theme-presets")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Lista los presets de tema visual guardados para el editor SCORM (brand kit del equipo)" })
  listScormThemePresets() {
    return this.adminService.listScormThemePresets();
  }

  @Post("scorm-theme-presets")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Guarda el tema visual actual del editor SCORM como preset reutilizable" })
  createScormThemePreset(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(upsertScormThemePresetSchema)) dto: any) {
    return this.adminService.createScormThemePreset(dto, user.id);
  }

  @Delete("scorm-theme-presets/:id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Elimina un preset de tema visual guardado" })
  deleteScormThemePreset(@Param("id") id: string) {
    return this.adminService.deleteScormThemePreset(id);
  }

  @Post("lessons/:id/generate-subtitles")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Encola la transcripción automática (Gemini) del video de la lección — TEACHER solo si es CourseStaff del curso dueño" })
  generateLessonSubtitles(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.adminService.generateLessonSubtitles(id, teacherScopeId(user));
  }

  @Post("lessons/:lessonId/materials")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Agrega un material (PDF/Word/Excel/imagen/video/link) a una lección — TEACHER solo si es CourseStaff del curso dueño" })
  createMaterial(@CurrentUser() user: RequestUser, @Param("lessonId") lessonId: string, @Body(new ZodValidationPipe(upsertMaterialSchema)) dto: any) {
    return this.adminService.createMaterial(lessonId, dto, teacherScopeId(user));
  }

  @Post("modules/:moduleId/materials")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Agrega una lectura/documento (principal o complementario) a nivel de módulo completo — TEACHER solo si es CourseStaff del curso dueño" })
  createModuleMaterial(@CurrentUser() user: RequestUser, @Param("moduleId") moduleId: string, @Body(new ZodValidationPipe(upsertMaterialSchema)) dto: any) {
    return this.adminService.createModuleMaterial(moduleId, dto, teacherScopeId(user));
  }

  @Patch("materials/:id")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Actualiza un material (p.ej. mostrar/ocultar al alumno, cambiar categoría principal/complementario) — TEACHER solo si es CourseStaff del curso dueño" })
  updateMaterial(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body(new ZodValidationPipe(updateMaterialSchema)) dto: any) {
    return this.adminService.updateMaterial(id, dto, teacherScopeId(user));
  }

  @Delete("materials/:id")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Elimina un material — TEACHER solo si es CourseStaff del curso dueño" })
  deleteMaterial(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.adminService.deleteMaterial(id, teacherScopeId(user));
  }

  @Patch("materials/:id/reorder")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Mueve un material una posición arriba/abajo entre sus hermanos (misma lección o módulo) — TEACHER solo si es CourseStaff del curso dueño" })
  reorderMaterial(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: { direction: "up" | "down" }) {
    return this.adminService.reorderMaterial(id, dto.direction, teacherScopeId(user));
  }

  // --- Evaluaciones (exámenes/quizzes) y sus preguntas — TEACHER solo en cursos donde es CourseStaff ---

  @Get("courses/:courseId/assessments")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Lista las evaluaciones de un curso, con sus preguntas" })
  listAssessments(
    @CurrentUser() user: RequestUser,
    @Param("courseId") courseId: string,
    @Query("includeArchived") includeArchived?: string,
  ) {
    return this.assessmentService.listForCourse(courseId, teacherScopeId(user), includeArchived === "true");
  }

  @Post("courses/:courseId/assessments")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Crea una evaluación (examen/quiz) para un curso" })
  createAssessment(
    @CurrentUser() user: RequestUser,
    @Param("courseId") courseId: string,
    @Body(new ZodValidationPipe(upsertAssessmentSchema)) dto: any,
  ) {
    return this.assessmentService.createAssessment(courseId, dto, teacherScopeId(user));
  }

  @Patch("assessments/:id")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Actualiza las reglas de una evaluación" })
  updateAssessment(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateAssessmentSchema)) dto: any,
  ) {
    return this.assessmentService.updateAssessment(id, dto, teacherScopeId(user));
  }

  @Delete("assessments/:id")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Elimina una evaluación (falla si ya tiene intentos de alumnos)" })
  deleteAssessment(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.assessmentService.deleteAssessment(id, teacherScopeId(user));
  }

  @Post("assessments/:assessmentId/questions")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Agrega una pregunta a una evaluación" })
  createQuestion(
    @CurrentUser() user: RequestUser,
    @Param("assessmentId") assessmentId: string,
    @Body(new ZodValidationPipe(upsertQuestionSchema)) dto: any,
  ) {
    return this.assessmentService.createQuestion(assessmentId, dto, teacherScopeId(user));
  }

  // "Hacer pregunta por pregunta es pesado... ¿se puede armar una plantilla
  // en Excel?" — plantilla descargable (con instrucciones + ejemplos por
  // tipo de pregunta) y su importación en lote.
  @Get("assessments/:assessmentId/questions/template.xlsx")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Descarga la plantilla Excel para cargar preguntas en lote" })
  downloadQuestionsTemplate(@Res() res: Response) {
    const buffer = this.assessmentService.buildQuestionsTemplateXlsx();
    res.set({
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="plantilla-preguntas.xlsx"',
    });
    res.send(buffer);
  }

  @Post("assessments/:assessmentId/questions/import")
  @Roles("ADMIN", "TEACHER")
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Crea preguntas en lote desde un archivo Excel (ver plantilla)" })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: fileMimeFilter(DOCUMENT_MIME_PREFIXES) }))
  importQuestions(
    @CurrentUser() user: RequestUser,
    @Param("assessmentId") assessmentId: string,
    @UploadedFile() file: { originalname: string; buffer: Buffer; mimetype: string },
  ) {
    return this.assessmentService.importQuestionsFromXlsx(assessmentId, file.buffer, teacherScopeId(user));
  }

  @Patch("assessments/:assessmentId/questions/reorder")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Reordena las preguntas de una evaluación (drag-and-drop del builder)" })
  reorderQuestions(
    @CurrentUser() user: RequestUser,
    @Param("assessmentId") assessmentId: string,
    @Body(new ZodValidationPipe(reorderQuestionsSchema)) dto: { orderedQuestionIds: string[] },
  ) {
    return this.assessmentService.reorderQuestions(assessmentId, dto.orderedQuestionIds, teacherScopeId(user));
  }

  // "Es muy complicado... no drag and drop" — reordenar los exámenes de un curso.
  @Patch("courses/:courseId/assessments/reorder")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Reordena los exámenes de un curso (drag-and-drop)" })
  reorderAssessments(
    @CurrentUser() user: RequestUser,
    @Param("courseId") courseId: string,
    @Body(new ZodValidationPipe(reorderAssessmentsSchema)) dto: { orderedAssessmentIds: string[] },
  ) {
    return this.assessmentService.reorderAssessments(courseId, dto.orderedAssessmentIds, teacherScopeId(user));
  }

  @Patch("questions/:id")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Actualiza una pregunta" })
  updateQuestion(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateQuestionSchema)) dto: any,
  ) {
    return this.assessmentService.updateQuestion(id, dto, teacherScopeId(user));
  }

  @Delete("questions/:id")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Elimina una pregunta" })
  deleteQuestion(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.assessmentService.deleteQuestion(id, teacherScopeId(user));
  }

  @Post("uploads")
  @Roles("ADMIN", "TEACHER")
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Sube un archivo (video/PDF/portada) a S3/MinIO y devuelve su assetId" })
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 50 * 1024 * 1024 }, fileFilter: fileMimeFilter(COURSE_ASSET_MIME_PREFIXES) }),
  )
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
    return this.assessmentService.listPendingReview(teacherScopeId(user));
  }

  @Get("attempts/suspicious")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Intentos marcados como posible trampa/uso de IA (nota alta + tiempo de resolución muy corto)" })
  suspiciousAttempts(@CurrentUser() user: RequestUser) {
    return this.assessmentService.listSuspiciousAttempts(teacherScopeId(user));
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
    return this.assessmentService.gradeAnswer(attemptId, answerId, user.id, dto, teacherScopeId(user));
  }

  @Get("attempts/pending-file-reviews")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Cola de exámenes 'cualitativos' (archivo) pendientes de calificar (TEACHER ve solo sus cursos)" })
  pendingFileReviews(@CurrentUser() user: RequestUser) {
    return this.assessmentService.listPendingFileReviews(teacherScopeId(user));
  }

  @Post("attempts/:attemptId/grade-file")
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Califica el archivo de respuesta completo de un examen 'cualitativo'" })
  gradeFileAttempt(
    @CurrentUser() user: RequestUser,
    @Param("attemptId") attemptId: string,
    @Body(new ZodValidationPipe(gradeFileAttemptSchema)) dto: { score: number; passed: boolean },
  ) {
    return this.assessmentService.gradeFileAttempt(attemptId, user.id, dto, teacherScopeId(user));
  }

  @Get("teacher-grading-workload")
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Por cada docente: calificaciones pendientes y días de atraso — para monitorear a los docentes desde el admin" })
  teacherGradingWorkload() {
    return this.assessmentService.listTeacherGradingWorkload();
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
  @ApiOperation({ summary: "Edita el HTML, tags o activa/desactiva una plantilla de certificado" })
  updateCertificateTemplate(@Param("id") id: string, @Body(new ZodValidationPipe(updateCertificateTemplateSchema)) dto: any) {
    return this.adminService.updateCertificateTemplate(id, dto);
  }

  @Delete("certificate-templates/:id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Elimina una plantilla de certificado (solo si no se usó nunca ni está asignada a un curso/programa)" })
  deleteCertificateTemplate(@Param("id") id: string) {
    return this.adminService.deleteCertificateTemplate(id);
  }

  // --- Convenios institucionales ---

  @Get("partner-institutions")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Lista instituciones socias (convenios) y sus cursos asociados" })
  listPartnerInstitutions() {
    return this.adminService.listPartnerInstitutions();
  }

  @Post("partner-institutions")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Crea una institución socia (convenio)" })
  createPartnerInstitution(@Body(new ZodValidationPipe(upsertPartnerInstitutionSchema)) dto: any) {
    return this.adminService.createPartnerInstitution(dto);
  }

  @Patch("partner-institutions/:id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Edita una institución socia" })
  updatePartnerInstitution(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(upsertPartnerInstitutionSchema.partial())) dto: any,
  ) {
    return this.adminService.updatePartnerInstitution(id, dto, user.id);
  }

  @Delete("partner-institutions/:id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Elimina una institución socia (y sus asociaciones a cursos)" })
  deletePartnerInstitution(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.adminService.deletePartnerInstitution(id, user.id);
  }

  @Post("partner-institutions/:id/courses")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Asocia un curso a un convenio (3ra firma en el certificado + costo en finanzas)" })
  addCoursePartnership(
    @CurrentUser() user: RequestUser,
    @Param("id") partnerInstitutionId: string,
    @Body(new ZodValidationPipe(addCoursePartnershipSchema)) dto: { courseId: string; startDate?: string; endDate?: string },
  ) {
    return this.adminService.addCoursePartnership({ ...dto, partnerInstitutionId }, user.id);
  }

  @Delete("partner-institutions/course-partnerships/:id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Desasocia un curso de un convenio" })
  removeCoursePartnership(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.adminService.removeCoursePartnership(id, user.id);
  }

  @Patch("partner-institutions/course-partnerships/:id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Renueva o extiende el plazo de un convenio ya asignado a un curso" })
  updateCoursePartnership(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCoursePartnershipSchema)) dto: { startDate?: string | null; endDate?: string | null },
  ) {
    return this.adminService.updateCoursePartnership(id, dto, user.id);
  }

  // --- Reporte de horas dictadas (conexión/desconexión en clases en vivo) ---

  @Get("teacher-session-hours")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Detalle y balance de horas dictadas por clase en vivo — hora de conexión/desconexión del docente, por docente y por curso" })
  listTeacherSessionHours(@Query("teacherId") teacherId?: string, @Query("courseId") courseId?: string, @Query("from") from?: string, @Query("to") to?: string) {
    return this.adminService.listTeacherSessionHours({
      teacherId,
      courseId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  // --- Liquidación de docentes ---

  @Get("teacher-rates")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Tarifas de docentes (global o por curso)" })
  listTeacherRates(@Query("teacherId") teacherId?: string) {
    return this.adminService.listTeacherRates(teacherId);
  }

  @Post("teacher-rates")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Crea o actualiza la tarifa de un docente (global o por curso)" })
  upsertTeacherRate(@Body(new ZodValidationPipe(upsertTeacherRateSchema)) dto: any) {
    return this.adminService.upsertTeacherRate(dto);
  }

  @Delete("teacher-rates/:id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Elimina una tarifa de docente" })
  deleteTeacherRate(@Param("id") id: string) {
    return this.adminService.deleteTeacherRate(id);
  }

  @Get("teacher-activity-logs")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Horas registradas de un docente por otras actividades (p.ej. calificar exámenes)" })
  listTeacherActivityLogs(@Query("teacherId") teacherId: string) {
    return this.adminService.listTeacherActivityLogs(teacherId);
  }

  @Post("teacher-activity-logs")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Registra horas de un docente en otras actividades" })
  createTeacherActivityLog(@Body(new ZodValidationPipe(createTeacherActivityLogSchema)) dto: any) {
    return this.adminService.createTeacherActivityLog(dto);
  }

  @Delete("teacher-activity-logs/:id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Elimina un registro de horas" })
  deleteTeacherActivityLog(@Param("id") id: string) {
    return this.adminService.deleteTeacherActivityLog(id);
  }

  @Get("teacher-advances")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Adelantos otorgados a un docente" })
  listTeacherAdvances(@Query("teacherId") teacherId: string) {
    return this.adminService.listTeacherAdvances(teacherId);
  }

  @Post("teacher-advances")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Otorga un adelanto a un docente — se descuenta de su próxima liquidación" })
  createTeacherAdvance(@Body(new ZodValidationPipe(createTeacherAdvanceSchema)) dto: any) {
    return this.adminService.createTeacherAdvance(dto);
  }

  @Delete("teacher-advances/:id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Elimina un adelanto (solo si no está aplicado a una liquidación)" })
  deleteTeacherAdvance(@Param("id") id: string) {
    return this.adminService.deleteTeacherAdvance(id);
  }

  @Get("teacher-liquidations/mine")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "TEACHER")
  @ApiOperation({ summary: "Mis liquidaciones (docente) — solo lectura" })
  myTeacherLiquidations(@CurrentUser() user: RequestUser) {
    return this.adminService.listTeacherLiquidations(user.id);
  }

  @Get("teacher-liquidations")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Liquidaciones de docentes (todas, o filtradas por docente)" })
  listTeacherLiquidations(@Query("teacherId") teacherId?: string) {
    return this.adminService.listTeacherLiquidations(teacherId);
  }

  @Post("teacher-liquidations/generate")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Genera la liquidación de un docente para un periodo (horas dictadas + otras actividades - adelantos)" })
  generateTeacherLiquidation(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(generateTeacherLiquidationSchema)) dto: any) {
    return this.adminService.generateTeacherLiquidation(dto, user.id);
  }

  @Patch("teacher-liquidations/:id/waive")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Perdona la penalidad por tardanza/salida temprana de una liquidación y paga completo" })
  waiveTeacherLiquidation(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body(new ZodValidationPipe(waiveLiquidationSchema)) dto: { reason: string }) {
    return this.adminService.waiveTeacherLiquidationDeduction(id, dto.reason, user.id);
  }

  @Patch("teacher-liquidations/:id/status")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Aprueba o marca como pagada una liquidación" })
  updateTeacherLiquidationStatus(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() dto: { status: "APPROVED" | "PAID" }) {
    return this.adminService.updateTeacherLiquidationStatus(id, dto.status, user.id);
  }

  // --- Regalías ---

  @Get("royalty-recipients")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Lista quienes reciben regalías y sus cursos asociados" })
  listRoyaltyRecipients() {
    return this.adminService.listRoyaltyRecipients();
  }

  @Post("royalty-recipients")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Crea a quien recibe regalías (no es un usuario de la plataforma)" })
  createRoyaltyRecipient(@Body(new ZodValidationPipe(upsertRoyaltyRecipientSchema)) dto: any) {
    return this.adminService.createRoyaltyRecipient(dto);
  }

  @Patch("royalty-recipients/:id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Edita a quien recibe regalías" })
  updateRoyaltyRecipient(@Param("id") id: string, @Body(new ZodValidationPipe(upsertRoyaltyRecipientSchema.partial())) dto: any) {
    return this.adminService.updateRoyaltyRecipient(id, dto);
  }

  @Delete("royalty-recipients/:id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Elimina a quien recibe regalías" })
  deleteRoyaltyRecipient(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.adminService.deleteRoyaltyRecipient(id, user.id);
  }

  @Post("royalty-recipients/:id/courses")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Asocia un curso a quien recibe regalías" })
  addCourseRoyalty(
    @Param("id") royaltyRecipientId: string,
    @Body(new ZodValidationPipe(addCourseRoyaltySchema)) dto: { courseId: string; startDate?: string; endDate?: string },
  ) {
    return this.adminService.addCourseRoyalty({ ...dto, royaltyRecipientId });
  }

  @Delete("royalty-recipients/course-royalties/:id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Desasocia un curso de quien recibe regalías" })
  removeCourseRoyalty(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.adminService.removeCourseRoyalty(id, user.id);
  }

  // --- Campañas de correo a clientes ---

  @Post("email-campaigns/audience-preview")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Cuenta a cuántos les llegaría una campaña con este filtro de audiencia, sin crearla" })
  previewEmailAudience(@Body(new ZodValidationPipe(emailAudienceFilterSchema)) filter: any) {
    return this.adminService.previewEmailAudienceCount(filter);
  }

  @Get("email-campaigns")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Lista las campañas de correo (borrador, programadas, enviadas)" })
  listEmailCampaigns() {
    return this.adminService.listEmailCampaigns();
  }

  @Post("email-campaigns")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Crea una campaña de correo, manual o redactada automáticamente con IA" })
  createEmailCampaign(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(upsertEmailCampaignSchema)) dto: any) {
    return this.adminService.createEmailCampaign(dto, user.id);
  }

  @Patch("email-campaigns/:id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Edita una campaña que todavía no se envió" })
  updateEmailCampaign(@Param("id") id: string, @Body(new ZodValidationPipe(updateEmailCampaignSchema)) dto: any) {
    return this.adminService.updateEmailCampaign(id, dto);
  }

  @Post("email-campaigns/:id/send-now")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Envía la campaña ahora (la recoge el worker en los próximos minutos)" })
  sendEmailCampaignNow(@Param("id") id: string) {
    return this.adminService.sendEmailCampaignNow(id);
  }

  @Delete("email-campaigns/:id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Elimina una campaña que todavía no se envió" })
  deleteEmailCampaign(@Param("id") id: string) {
    return this.adminService.deleteEmailCampaign(id);
  }

  // "También debería de poderse crear listas de correo... y poderlas
  // reutilizar, actualizar, borrar" — audiencia guardada, reusa
  // /email-campaigns/audience-preview de arriba para "a cuántos llega".
  @Get("mailing-lists")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Lista las listas de correo guardadas (audiencias reutilizables)" })
  listMailingLists() {
    return this.adminService.listMailingLists();
  }

  @Post("mailing-lists")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Guarda una nueva lista de correo (audiencia reutilizable)" })
  createMailingList(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(upsertMailingListSchema)) dto: any) {
    return this.adminService.createMailingList(dto, user.id);
  }

  @Patch("mailing-lists/:id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Edita una lista de correo guardada" })
  updateMailingList(@Param("id") id: string, @Body(new ZodValidationPipe(updateMailingListSchema)) dto: any) {
    return this.adminService.updateMailingList(id, dto);
  }

  @Delete("mailing-lists/:id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Elimina una lista de correo guardada" })
  deleteMailingList(@Param("id") id: string) {
    return this.adminService.deleteMailingList(id);
  }

  @Get("companies")
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Lista todas las empresas" })
  listCompanies() {
    return this.adminService.listCompanies();
  }

  @Get("courtesy-grants")
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Historial de accesos gratuitos otorgados (cortesías) — filtrable por año/curso/área" })
  listCourtesyGrants(@Query("year") year?: string, @Query("courseId") courseId?: string, @Query("areaSlug") areaSlug?: string) {
    return this.adminService.listCourtesyGrants({ year: year ? Number(year) : undefined, courseId, areaSlug });
  }

  @Delete("courtesy-grants")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Elimina del historial una o varias cortesías (solo deja de listarlas, no revoca el acceso ya otorgado)" })
  deleteCourtesyGrants(@Body(new ZodValidationPipe(deleteCourtesyGrantsSchema)) dto: { ids: string[] }) {
    return this.adminService.deleteCourtesyGrants(dto.ids);
  }

  @Get("course-ratings")
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Resultados de la encuesta de satisfacción (estrellas) — distribución + listado de comentarios, filtrable por curso" })
  listCourseRatings(@Query("courseId") courseId?: string) {
    return this.adminService.listCourseRatings({ courseId });
  }

  @Get("quotes")
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Pipeline comercial: todas las cotizaciones B2B, de todas las empresas" })
  listAllQuotes() {
    return this.companiesService.listAllQuotes();
  }

  @Patch("quotes/:id/respond")
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Ventas fija monto/oferta/vigencia de una cotización — pasa a SENT" })
  respondToQuote(@Param("id") id: string, @Body(new ZodValidationPipe(respondToQuoteSchema)) dto: any) {
    return this.companiesService.respondToQuote(id, dto);
  }

  @Post("quotes/:id/convert")
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Convierte una cotización ACEPTADA en cupos B2B reales" })
  convertQuote(@Param("id") id: string) {
    return this.companiesService.convertQuoteToSeatPool(id);
  }

  @Get("orders")
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Busca órdenes por id, email del comprador o razón social — ordenable por empresa/fecha/curso/estado/categoría" })
  listOrders(@Query("q") q?: string, @Query("sortBy") sortBy?: string) {
    return this.adminService.listOrders(q, sortBy);
  }

  // listOrders() limita a las últimas 200 (evita traer la tabla completa
  // para una búsqueda) — un total/desglose por estado calculado sobre esa
  // lista recortada mentiría en cuanto hubiera más de 200 órdenes. Este
  // resumen corre su propio COUNT/SUM sobre la tabla completa.
  @Get("orders/summary")
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Total de órdenes por estado + monto pagado (para las tarjetas resumen de /admin/ordenes)" })
  getOrdersSummary() {
    return this.adminService.getOrdersSummary();
  }

  // --- Matrículas (ampliar plazo de acceso como caso especial) ---

  @Get("enrollments")
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Busca matrículas por nombre/correo del alumno" })
  listEnrollments(@Query("q") q?: string) {
    return this.adminService.listEnrollments(q);
  }

  @Patch("enrollments/:id/extend-access")
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Amplía (o quita) el vencimiento de acceso de una matrícula puntual" })
  extendEnrollmentAccess(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(extendEnrollmentAccessSchema)) dto: { accessExpiresAt: Date | null },
  ) {
    return this.adminService.extendEnrollmentAccess(id, dto.accessExpiresAt);
  }

  // "El administrador debería tener la facultad de resetear un avance a 0%
  // o ponerlo como 100%... en casos extremos" — mismo criterio de "caso
  // especial" que extendEnrollmentAccess arriba.
  @Patch("enrollments/:id/reset-progress")
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Fuerza el avance de una matrícula a 0% o 100% (caso extremo)" })
  resetEnrollmentProgress(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(resetEnrollmentProgressSchema)) dto: { target: "ZERO" | "FULL" },
  ) {
    return this.enrollmentService.adminSetProgress(id, dto.target);
  }

  // --- Finanzas ---

  @Get("finance/summary")
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Ingresos, IGV, detracción, comisión de pasarela, gastos y saldo total, con selector de periodo" })
  getFinancialSummary(
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("period") period?: string,
    @Query("year") year?: string,
  ) {
    return this.adminService.getFinancialSummary({ from, to, period, year: year ? Number(year) : undefined });
  }

  @Get("finance/detail")
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Ingresos/egresos en el tiempo (día/semana/mes/año) + gastos manuales por categoría, para el botón 'Ver detalle'" })
  getFinancialDetail(@Query("from") from?: string, @Query("to") to?: string, @Query("groupBy") groupBy?: string) {
    const validGroupBy = (["day", "week", "month", "year"] as const).includes(groupBy as never) ? (groupBy as "day" | "week" | "month" | "year") : "month";
    return this.adminService.getFinancialDetail({ from, to, groupBy: validGroupBy });
  }

  @Patch("finance/fee-settings")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Configura comisiones de pasarela y las reglas de detracción por tipo de comprador" })
  updateFeeSettings(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(updateFeeSettingsSchema)) dto: Record<string, unknown>) {
    return this.adminService.updateFeeSettings(dto as never, user.id);
  }

  @Get("finance/report.pdf")
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Descarga el estado financiero del periodo como PDF" })
  async downloadFinancialReport(
    @Res() res: Response,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("period") period?: string,
    @Query("year") year?: string,
    @Query("months") months?: string,
  ) {
    const { pdf, periodLabel } = await this.adminService.getFinancialReportPdf({
      from,
      to,
      period,
      year: year ? Number(year) : undefined,
      months: months ? Number(months) : undefined,
    });
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="inkademy-finanzas-${periodLabel.replace(/\s+/g, "-")}.pdf"`,
    });
    res.send(pdf);
  }

  @Post("finance/report/email")
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Envía el estado financiero del periodo por correo, en PDF adjunto" })
  emailFinancialReport(
    @Body() body: { recipientEmail: string; from?: string; to?: string; period?: string; year?: number; months?: number },
  ) {
    return this.adminService.emailFinancialReport(body.recipientEmail, {
      from: body.from,
      to: body.to,
      period: body.period,
      year: body.year,
      months: body.months,
    });
  }

  @Get("finance/expenses")
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Lista los gastos registrados a mano" })
  listExpenses(@Query("from") from?: string, @Query("to") to?: string) {
    return this.adminService.listExpenses({ from, to });
  }

  @Post("finance/expenses")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Registra un gasto (hosting, marketing, planilla, etc.) — de una vez, mensual o anual" })
  createExpense(
    @Body(new ZodValidationPipe(createExpenseSchema))
    dto: { description: string; amount: number; currency?: string; category?: string; incurredAt?: Date; recurrence?: string },
  ) {
    return this.adminService.createExpense({ ...dto, incurredAt: dto.incurredAt?.toISOString() });
  }

  @Delete("finance/expenses/:id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Elimina un gasto registrado" })
  deleteExpense(@Param("id") id: string) {
    return this.adminService.deleteExpense(id);
  }

  @Get("finance/profit-and-loss")
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Estado de resultados mensual, punto de equilibrio y pronóstico de crecimiento" })
  getProfitAndLoss(@Query("months") months?: string) {
    return this.adminService.getProfitAndLoss({ months: months ? Number(months) : undefined });
  }

  // --- Usuarios y roles ---

  @Get("users")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Lista/busca cuentas de usuario (todas, sin importar el rol)" })
  listUsers(@Query("q") q?: string, @Query("role") role?: string, @Query("pageSize") pageSize?: string) {
    return this.adminService.listUsers({ q, role, pageSize: pageSize ? Number(pageSize) : undefined });
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
  resetUserPassword(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(adminResetPasswordSchema)) dto: { password?: string },
  ) {
    return this.adminService.resetUserPassword(id, user.id, dto.password);
  }

  @Delete("users/:id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Elimina una cuenta (rechaza si tiene órdenes/certificados/matrículas — desactívala en su lugar)" })
  deleteUser(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.adminService.deleteUser(id, user.id);
  }

  // --- Zona de pruebas: borrado en lote (solo ADMIN, nunca SUPPORT) ---

  @Post("zona-de-pruebas/users/bulk-delete")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Borra en lote cuentas sin órdenes/certificados/matrículas — el resto se omite con el motivo" })
  bulkDeleteUsers(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(bulkIdsSchema)) dto: { ids: string[] }) {
    return this.adminService.bulkDeleteUsers(dto.ids, user.id);
  }

  @Post("zona-de-pruebas/courses/bulk-delete")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Borra en lote cursos sin matrículas/compras/certificados/cupos — el resto se omite con el motivo" })
  bulkDeleteCourses(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(bulkIdsSchema)) dto: { ids: string[] }) {
    return this.adminService.bulkDeleteCourses(dto.ids, user.id);
  }

  @Post("zona-de-pruebas/areas/bulk-delete")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Borra en lote áreas sin cursos asignados — el resto se omite con el motivo" })
  bulkDeleteAreas(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(bulkIdsSchema)) dto: { ids: string[] }) {
    return this.adminService.bulkDeleteAreas(dto.ids, user.id);
  }

  @Post("zona-de-pruebas/companies/bulk-delete")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Borra en lote empresas B2B sin órdenes/matrículas/cupos usados — el resto se omite con el motivo" })
  bulkDeleteCompanies(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(bulkIdsSchema)) dto: { ids: string[] }) {
    return this.adminService.bulkDeleteCompanies(dto.ids, user.id);
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

  @Patch("course-staff/:id/can-edit")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Bloquea/restaura el permiso de edición de un docente sobre este curso, sin desasignarlo" })
  setCourseStaffCanEdit(@Param("id") id: string, @Body() dto: { canEdit: boolean }) {
    return this.adminService.setCourseStaffCanEdit(id, dto.canEdit);
  }

  // --- Backups descargables ---

  @Get("backups")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Lista el historial de backups completos generados" })
  listBackups() {
    return this.adminService.listBackups();
  }

  @Post("backups/generate")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Encola la generación de un backup completo ahora mismo" })
  generateBackupNow(@CurrentUser() user: RequestUser) {
    return this.adminService.generateBackupNow(user.id);
  }

  @Get("backups/:id/download-url")
  @Roles("ADMIN")
  @ApiOperation({ summary: "URL firmada (15 min) para descargar un backup ya generado" })
  getBackupDownloadUrl(@Param("id") id: string) {
    return this.adminService.getBackupDownloadUrl(id);
  }

  // --- Auditoría genérica ---

  @Get("audit-log")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Bucea en el histórico de acciones administrativas (AuditLog), con filtros" })
  listAuditLog(
    @Query("entity") entity?: string,
    @Query("action") action?: string,
    @Query("actorId") actorId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.adminService.listAuditLog(
      { entity, action, actorId, from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined },
      Number(page) || undefined,
      Number(pageSize) || undefined,
    );
  }
}

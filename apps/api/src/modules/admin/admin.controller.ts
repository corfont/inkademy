import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import type { RequestUser } from "../../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import {
  gradeAnswerSchema,
  updateCourseSchema,
  updateProgramSchema,
  upsertAreaSchema,
  upsertCertificateTemplateSchema,
  upsertCourseSchema,
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

  @Get("companies")
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Lista todas las empresas" })
  listCompanies() {
    return this.adminService.listCompanies();
  }
}

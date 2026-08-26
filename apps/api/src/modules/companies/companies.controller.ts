import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, UseInterceptors } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createCompanySchema, inviteCollaboratorSchema, requestQuoteSchema, updateQuoteStatusSchema } from "@inkademy/shared";
import type { CreateCompanyInput, InviteCollaboratorInput, RequestQuoteInput, UpdateQuoteStatusInput } from "@inkademy/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { CompanyRoles } from "../../common/decorators/company-roles.decorator";
import { CompanyGuard } from "../../common/guards/company.guard";
import { TenantContextInterceptor } from "../../common/interceptors/tenant-context.interceptor";
import type { RequestUser } from "../../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { assignSeatSchema, createSeatPoolSchema, renewSeatPoolSchema, updateCertificateSettingsSchema } from "../../common/validation/local-schemas";
import { CertificateService } from "../certificate/certificate.service";
import { CompaniesService } from "./companies.service";

// TenantContextInterceptor a nivel de controller (no ruta por ruta): en las
// rutas sin :companyId (create/listMine) no hay req.companyMembership, así
// que no hace nada — y así ninguna ruta nueva de este controller se olvida
// de tener el respaldo de RLS activo (ver prisma.module.ts).
@ApiTags("companies")
@ApiBearerAuth()
@Controller("companies")
@UseInterceptors(TenantContextInterceptor)
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly certificateService: CertificateService,
  ) {}

  @Post()
  @ApiOperation({ summary: "Crea una empresa y su primer COMPANY_ADMIN (el creador)" })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createCompanySchema)) dto: CreateCompanyInput,
  ) {
    return this.companiesService.create(user.id, dto);
  }

  @Get("mine")
  @ApiOperation({ summary: "Empresas a las que pertenezco — para resolver a dónde entrar tras iniciar sesión" })
  listMine(@CurrentUser() user: RequestUser) {
    return this.companiesService.listMine(user.id);
  }

  @Get(":companyId/dashboard")
  @UseGuards(CompanyGuard)
  @ApiOperation({ summary: "Resumen ejecutivo B2B: participantes, cupos, progreso, riesgo" })
  dashboard(@Param("companyId") companyId: string) {
    return this.companiesService.getDashboard(companyId);
  }

  @Get(":companyId/certificates")
  @UseGuards(CompanyGuard)
  @ApiOperation({ summary: "Certificados emitidos a colaboradores de la empresa" })
  certificates(@Param("companyId") companyId: string) {
    return this.certificateService.listForCompany(companyId);
  }

  @Get(":companyId/certificate-settings")
  @UseGuards(CompanyGuard)
  @ApiOperation({ summary: "A quién se envían por correo los certificados de la empresa (alumno/administrador/ambos)" })
  getCertificateSettings(@Param("companyId") companyId: string) {
    return this.companiesService.getCertificateSettings(companyId);
  }

  @Patch(":companyId/certificate-settings")
  @UseGuards(CompanyGuard)
  @CompanyRoles("COMPANY_ADMIN")
  @ApiOperation({ summary: "Configura a quién se envían por correo los certificados de la empresa" })
  updateCertificateSettings(
    @Param("companyId") companyId: string,
    @Body(new ZodValidationPipe(updateCertificateSettingsSchema)) dto: { certificateDeliveryTarget: "STUDENT" | "COMPANY_ADMIN" | "BOTH" },
  ) {
    return this.companiesService.updateCertificateSettings(companyId, dto.certificateDeliveryTarget);
  }

  @Get(":companyId/members")
  @UseGuards(CompanyGuard)
  @ApiOperation({ summary: "Lista colaboradores de la empresa (filtrable por team/role)" })
  listMembers(
    @Param("companyId") companyId: string,
    @Query("team") team?: string,
    @Query("role") role?: string,
  ) {
    return this.companiesService.listMembers(companyId, { team, role });
  }

  @Post(":companyId/members/invite")
  @UseGuards(CompanyGuard)
  @CompanyRoles("COMPANY_ADMIN")
  @ApiOperation({ summary: "Invita a un colaborador (crea usuario si no existe)" })
  invite(
    @CurrentUser() user: RequestUser,
    @Param("companyId") companyId: string,
    @Body(new ZodValidationPipe(inviteCollaboratorSchema)) dto: InviteCollaboratorInput,
  ) {
    return this.companiesService.inviteMember(companyId, user.id, dto);
  }

  @Delete(":companyId/members/:membershipId")
  @UseGuards(CompanyGuard)
  @CompanyRoles("COMPANY_ADMIN")
  @ApiOperation({ summary: "Elimina (soft) a un colaborador de la empresa" })
  removeMember(@Param("companyId") companyId: string, @Param("membershipId") membershipId: string) {
    return this.companiesService.removeMember(companyId, membershipId);
  }

  @Get(":companyId/seat-pools")
  @UseGuards(CompanyGuard)
  @ApiOperation({ summary: "Cupos B2B por oferta (curso/programa)" })
  listSeatPools(@Param("companyId") companyId: string) {
    return this.companiesService.listSeatPools(companyId);
  }

  // Adicional al contrato explícito: alta manual de un seat pool (además de
  // la compra vía /checkout con seatPoolQty), útil para asignaciones admin.
  @Post(":companyId/seat-pools")
  @UseGuards(CompanyGuard)
  @CompanyRoles("COMPANY_ADMIN")
  @ApiOperation({ summary: "Crea manualmente un pool de cupos B2B" })
  createSeatPool(@Param("companyId") companyId: string, @Body(new ZodValidationPipe(createSeatPoolSchema)) dto: any) {
    return this.companiesService.createSeatPool(companyId, dto);
  }

  @Patch(":companyId/seat-pools/:poolId/renew")
  @UseGuards(CompanyGuard)
  @CompanyRoles("COMPANY_ADMIN")
  @ApiOperation({ summary: "Extiende el vencimiento de un pool de cupos (renovación, sin pasar por checkout/pago)" })
  renewSeatPool(
    @Param("companyId") companyId: string,
    @Param("poolId") poolId: string,
    @Body(new ZodValidationPipe(renewSeatPoolSchema)) dto: { months: number },
  ) {
    return this.companiesService.renewSeatPool(companyId, poolId, dto.months);
  }

  @Post(":companyId/seat-pools/:poolId/assign")
  @UseGuards(CompanyGuard)
  @CompanyRoles("COMPANY_ADMIN")
  @ApiOperation({ summary: "Asigna un cupo del pool a un colaborador (crea Enrollment B2B_SEAT)" })
  assignSeat(
    @Param("companyId") companyId: string,
    @Param("poolId") poolId: string,
    @Body(new ZodValidationPipe(assignSeatSchema)) dto: { userId: string },
  ) {
    return this.companiesService.assignSeat(companyId, poolId, dto.userId);
  }

  @Get(":companyId/reports")
  @UseGuards(CompanyGuard)
  @ApiOperation({ summary: "Reporte agregado de avance/asistencia/notas" })
  getReports(
    @Param("companyId") companyId: string,
    @Query("area") area?: string,
    @Query("team") team?: string,
    @Query("courseId") courseId?: string,
  ) {
    return this.companiesService.getReports(companyId, { area, team, courseId });
  }

  @Post(":companyId/quotes")
  @UseGuards(CompanyGuard)
  @CompanyRoles("COMPANY_ADMIN")
  @ApiOperation({ summary: "Solicita una cotización" })
  requestQuote(
    @CurrentUser() user: RequestUser,
    @Param("companyId") companyId: string,
    @Body(new ZodValidationPipe(requestQuoteSchema)) dto: RequestQuoteInput,
  ) {
    return this.companiesService.requestQuote(companyId, user.id, dto);
  }

  @Get(":companyId/quotes")
  @UseGuards(CompanyGuard)
  @ApiOperation({ summary: "Lista cotizaciones de la empresa" })
  listQuotes(@Param("companyId") companyId: string) {
    return this.companiesService.listQuotes(companyId);
  }

  @Patch(":companyId/quotes/:id/status")
  @UseGuards(CompanyGuard)
  @CompanyRoles("COMPANY_ADMIN")
  @ApiOperation({ summary: "Acepta o rechaza una cotización ya respondida por ventas" })
  updateQuoteStatus(
    @Param("companyId") companyId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateQuoteStatusSchema)) dto: UpdateQuoteStatusInput,
  ) {
    return this.companiesService.updateQuoteStatus(companyId, id, dto.status);
  }
}

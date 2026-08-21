import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createCompanySchema, inviteCollaboratorSchema, requestQuoteSchema } from "@inkademy/shared";
import type { CreateCompanyInput, InviteCollaboratorInput, RequestQuoteInput } from "@inkademy/shared";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { CompanyRoles } from "../../common/decorators/company-roles.decorator";
import { CompanyGuard } from "../../common/guards/company.guard";
import type { RequestUser } from "../../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { assignSeatSchema, createSeatPoolSchema } from "../../common/validation/local-schemas";
import { CompaniesService } from "./companies.service";

@ApiTags("companies")
@ApiBearerAuth()
@Controller("companies")
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @ApiOperation({ summary: "Crea una empresa y su primer COMPANY_ADMIN (el creador)" })
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createCompanySchema)) dto: CreateCompanyInput,
  ) {
    return this.companiesService.create(user.id, dto);
  }

  @Get(":companyId/dashboard")
  @UseGuards(CompanyGuard)
  @ApiOperation({ summary: "Resumen ejecutivo B2B: participantes, cupos, progreso, riesgo" })
  dashboard(@Param("companyId") companyId: string) {
    return this.companiesService.getDashboard(companyId);
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
}

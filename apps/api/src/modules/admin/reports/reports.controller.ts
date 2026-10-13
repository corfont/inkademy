import { Controller, Get, Param, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../../common/decorators/current-user.decorator";
import type { RequestUser } from "../../../common/guards/jwt-auth.guard";
import { Roles } from "../../../common/decorators/roles.decorator";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { ReportsService } from "./reports.service";

@ApiTags("admin-reports")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller("admin/reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Catálogo de reportes PDF disponibles" })
  list() {
    return ReportsService.CATALOG;
  }

  @Get(":key.pdf")
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Descarga un reporte PDF por su clave" })
  async download(
    @CurrentUser() user: RequestUser,
    @Param("key") key: string,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("teacherId") teacherId: string | undefined,
    @Query("courseId") courseId: string | undefined,
    @Res() res: Response,
  ) {
    const { pdf, filename } = await this.reports.generate(key, { from, to, teacherId, courseId });
    await this.reports.auditExport(user.id, key, "pdf", { from, to, teacherId, courseId });
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` });
    res.send(pdf);
  }

  @Get(":key.xlsx")
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Descarga el mismo reporte en Excel (.xlsx)" })
  async downloadXlsx(
    @CurrentUser() user: RequestUser,
    @Param("key") key: string,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("teacherId") teacherId: string | undefined,
    @Query("courseId") courseId: string | undefined,
    @Res() res: Response,
  ) {
    const { xlsx, filename } = await this.reports.generateXlsx(key, { from, to, teacherId, courseId });
    await this.reports.auditExport(user.id, key, "xlsx", { from, to, teacherId, courseId });
    res.set({ "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${filename}"` });
    res.send(xlsx);
  }
}

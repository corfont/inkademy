import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import type { RequestUser } from "../../common/guards/jwt-auth.guard";
import { CertificateService } from "./certificate.service";

@ApiTags("certificates")
@Controller()
export class CertificateController {
  constructor(private readonly certificateService: CertificateService) {}

  @Public()
  @Get("certificates/verify/:code")
  @ApiOperation({ summary: "Verifica públicamente un certificado por su código" })
  verify(@Param("code") code: string) {
    return this.certificateService.verifyByCode(code);
  }

  @ApiBearerAuth()
  @Get("certificates/:id/pdf")
  @ApiOperation({ summary: "Redirige a la URL firmada del PDF del certificado" })
  async downloadPdf(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const url = await this.certificateService.getDownloadRedirectUrl(
      id,
      user.id,
      user.globalRole === "ADMIN" || user.globalRole === "SUPPORT",
    );
    return res.redirect(url);
  }

  @ApiBearerAuth()
  @Post("certificates/:id/email")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Reenvía el PDF del certificado por correo al propio usuario" })
  emailToSelf(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.certificateService.emailToSelf(id, user.id);
  }

  @ApiBearerAuth()
  @Get("me/certificates")
  @ApiOperation({ summary: "Mis certificados" })
  listMine(@CurrentUser() user: RequestUser) {
    return this.certificateService.listMine(user.id);
  }

  @ApiBearerAuth()
  @Get("admin/certificates")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Todos los certificados emitidos (búsqueda global, admin)" })
  listAll() {
    return this.certificateService.listAll();
  }

  @ApiBearerAuth()
  @Get("admin/certificates/export")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Descarga en un .zip todos los certificados emitidos (o los filtrados por curso/empresa)" })
  async exportZip(
    @Query("courseId") courseId: string | undefined,
    @Query("companyId") companyId: string | undefined,
    @Res() res: Response,
  ) {
    const { filename, archive } = await this.certificateService.exportZip({ courseId, companyId });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    archive.pipe(res);
  }
}

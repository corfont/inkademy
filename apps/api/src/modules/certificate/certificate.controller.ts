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

  // "MetadataTooLarge" (u otro error crudo del storage) no debe llegarle al
  // alumno como XML sin envolver — antes el frontend enlazaba DIRECTO a la
  // URL pública del storage (this.storage.getPublicUrl, sin pasar por acá
  // en absoluto: este endpoint nunca se llamaba, código muerto). Ahora el
  // frontend pide esta URL firmada primero (con el mismo chequeo de dueño
  // de siempre) y recién ahí navega — cualquier hipo del storage lo ve
  // Nest, no el navegador del alumno directo contra el bucket.
  @ApiBearerAuth()
  @Get("certificates/:id/pdf")
  @ApiOperation({ summary: "URL firmada del PDF del certificado (el frontend navega a esa URL después)" })
  async downloadPdf(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    const url = await this.certificateService.getDownloadRedirectUrl(
      id,
      user.id,
      user.globalRole === "ADMIN" || user.globalRole === "SUPPORT",
    );
    return { url };
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
  @Post("admin/certificates/:id/regenerate")
  @UseGuards(RolesGuard)
  @Roles("ADMIN", "SUPPORT")
  @ApiOperation({ summary: "Vuelve a generar el PDF (aplica firma/plantilla actualizada)" })
  regenerate(@Param("id") id: string) {
    return this.certificateService.regenerate(id);
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

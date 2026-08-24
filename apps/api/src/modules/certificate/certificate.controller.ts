import { Controller, Get, Param, Res, UseGuards } from "@nestjs/common";
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
}

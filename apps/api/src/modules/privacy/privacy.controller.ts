import { Body, Controller, Get, Param, Post, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { RolesGuard } from "../../common/guards/roles.guard";
import type { RequestUser } from "../../common/guards/jwt-auth.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import {
  PrivacyService,
  createPrivacyRequestSchema,
  resolvePrivacyRequestSchema,
  type CreatePrivacyRequestInput,
  type ResolvePrivacyRequestInput,
} from "./privacy.service";

@ApiTags("privacy")
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Controller()
export class PrivacyController {
  constructor(private readonly service: PrivacyService) {}

  // --- Cualquier persona con sesión (cualquier rol) ---

  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Get("privacy/export")
  @ApiOperation({ summary: "Descarga una copia de mis datos personales (derecho de acceso, Ley 29733)" })
  async exportMine(@CurrentUser() user: RequestUser, @Res() res: Response) {
    const data = await this.service.exportMyData(user.id);
    res.set({
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="mis-datos-inkademy-${new Date().toISOString().slice(0, 10)}.json"`,
    });
    res.send(JSON.stringify(data, null, 2));
  }

  @Get("privacy/requests")
  @ApiOperation({ summary: "Mis solicitudes de privacidad" })
  listMine(@CurrentUser() user: RequestUser) {
    return this.service.listMine(user.id);
  }

  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @Post("privacy/requests")
  @ApiOperation({ summary: "Pide rectificación, oposición o eliminación de mis datos" })
  create(@CurrentUser() user: RequestUser, @Body(new ZodValidationPipe(createPrivacyRequestSchema)) dto: CreatePrivacyRequestInput) {
    return this.service.createRequest(user.id, dto);
  }

  // --- Administración (solo ADMIN: ejecutar una eliminación es irreversible) ---

  @Roles("ADMIN")
  @Get("admin/privacy-requests")
  @ApiOperation({ summary: "Solicitudes de privacidad de todos los usuarios" })
  listAll() {
    return this.service.listAll();
  }

  @Roles("ADMIN")
  @Post("admin/privacy-requests/:id/resolve")
  @ApiOperation({ summary: "Marca una solicitud como atendida o rechazada, con la respuesta a la persona" })
  resolve(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body(new ZodValidationPipe(resolvePrivacyRequestSchema)) dto: ResolvePrivacyRequestInput) {
    return this.service.resolve(id, user.id, dto);
  }

  @Roles("ADMIN")
  @Post("admin/privacy-requests/:id/execute-cancellation")
  @ApiOperation({ summary: "Elimina/anonimiza los datos personales de la cuenta (irreversible)" })
  execute(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.service.executeCancellation(id, user.id);
  }
}

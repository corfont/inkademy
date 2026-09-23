import { BadRequestException, Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Public } from "../../common/decorators/public.decorator";
import { CrmSecretGuard } from "./guards/crm-secret.guard";
import { PlatformCoreService } from "./platform-core.service";

/**
 * Puente de aprovisionamiento de cuentas con el CRM (Platform Core) — ver
 * CRM/app/src/lib/platform-core.ts (el lado que llama esto) y
 * ../../../../../../CLAUDE.md, sección "Platform Core". @Public() +
 * CrmSecretGuard: NO usa JWT de usuario, solo el secreto compartido.
 * Excluido de Swagger a propósito — no es una API pública de la
 * plataforma, es un puente interno server-a-servidor.
 */
@ApiExcludeController()
@Controller("platform-core")
@Public()
@UseGuards(CrmSecretGuard)
export class PlatformCoreController {
  constructor(private readonly service: PlatformCoreService) {}

  @Post("cuentas")
  cuentas(@Body() body: { email?: string; nombre?: string; password?: string; role?: string }) {
    const { email, nombre, password, role } = body ?? {};
    if (!email || !nombre || !password) {
      throw new BadRequestException("email, nombre y password son requeridos");
    }
    return this.service.provisionarCuenta({ email, nombre, password, role });
  }

  @Post("bloqueo")
  bloqueo(@Body() body: { email?: string; bloquear?: boolean }) {
    const { email, bloquear } = body ?? {};
    if (!email || typeof bloquear !== "boolean") {
      throw new BadRequestException("email y bloquear (boolean) son requeridos");
    }
    return this.service.bloquearCuenta({ email, bloquear });
  }
}

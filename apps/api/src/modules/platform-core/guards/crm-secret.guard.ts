import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Autenticación server-a-servidor para las rutas que el CRM llama
 * (Platform Core) — Bearer CRM_API_SECRET, mismo secreto que ya usa
 * CrmBridgeProvider (../../commerce/providers/crm-bridge.provider.ts) para
 * la dirección contraria (Inkademy → CRM). Estas rutas van marcadas
 * @Public() para saltarse el JwtAuthGuard global — este guard es su única
 * protección real, no un extra.
 */
@Injectable()
export class CrmSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<string>("CRM_API_SECRET", "");
    if (!secret) throw new UnauthorizedException("CRM_API_SECRET no configurado");

    const request = context.switchToHttp().getRequest();
    const header = request.headers["authorization"];
    if (header !== `Bearer ${secret}`) throw new UnauthorizedException("No autorizado");

    return true;
  }
}

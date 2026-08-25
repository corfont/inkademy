import { ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import type { GlobalRole } from "@inkademy/shared";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";

export interface RequestUser {
  id: string;
  email: string;
  globalRole: GlobalRole;
  // Todos los roles efectivos del usuario (globalRole + secondaryRoles,
  // sin duplicados) — "un docente podría ser también alumno, administrador
  // y soporte al mismo tiempo". RolesGuard/CompanyGuard validan contra este
  // arreglo, no solo contra globalRole.
  roles: GlobalRole[];
}

/**
 * Guard JWT global (registrado como APP_GUARD). Todas las rutas requieren
 * `Authorization: Bearer <accessToken>` salvo que estén marcadas @Public().
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}

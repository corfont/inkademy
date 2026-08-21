import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { GlobalRole } from "@inkademy/shared";
import { ROLES_KEY } from "../decorators/roles.decorator";
import type { RequestUser } from "./jwt-auth.guard";

/** Verifica que req.user.globalRole esté dentro de los @Roles(...) requeridos. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<GlobalRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user: RequestUser | undefined = request.user;
    if (!user) throw new ForbiddenException("No autenticado");
    if (!required.includes(user.globalRole)) {
      throw new ForbiddenException(
        `Requiere uno de los roles: ${required.join(", ")}`,
      );
    }
    return true;
  }
}

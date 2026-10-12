import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@inkademy/db";
import { adminModuleForApiPath, adminPermissionAllows, type AdminPermissions } from "@inkademy/shared";
import { PRISMA } from "../prisma/prisma.module";
import type { RequestUser } from "./jwt-auth.guard";

type CachedAccess = { expires: number; restricted: boolean; active: boolean; permissions: AdminPermissions };
const cache = new Map<string, CachedAccess>();
const TTL_MS = 15_000;

/** Se llama al cambiar un rol o su asignación, para que el cambio se vea de inmediato y no tras el TTL. */
export function clearAdminAccessCache() {
  cache.clear();
}

/** Lee (con una caché corta) el rol de administrador acotado de un usuario. `restricted=false` = administrador completo. */
export async function loadAdminAccess(prisma: PrismaClient, userId: string): Promise<CachedAccess> {
  const hit = cache.get(userId);
  if (hit && hit.expires > Date.now()) return hit;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { adminRole: { select: { active: true, permissions: true } } } });
  const value: CachedAccess = user?.adminRole
    ? { expires: Date.now() + TTL_MS, restricted: true, active: user.adminRole.active, permissions: (user.adminRole.permissions ?? {}) as AdminPermissions }
    : { expires: Date.now() + TTL_MS, restricted: false, active: true, permissions: {} };
  cache.set(userId, value);
  return value;
}

/**
 * Guard global: en las rutas /admin/* aplica el rol de administrador acotado del usuario (si lo tiene). Quien no tiene rol acotado queda exactamente
 * como antes — lo siguen decidiendo los @Roles de cada controlador. Va DESPUÉS de JwtAuthGuard.
 */
@Injectable()
export class AdminModuleGuard implements CanActivate {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: RequestUser | undefined = request.user;
    if (!user) return true;
    const module = adminModuleForApiPath(request.originalUrl ?? request.url ?? "");
    if (module === undefined || module === null) return true;

    const access = await loadAdminAccess(this.prisma, user.id);
    if (!access.restricted) return true;
    if (!access.active) throw new ForbiddenException("Tu rol de administrador está desactivado");
    if (module === "__owner__") throw new ForbiddenException("Solo un administrador completo puede gestionar los roles");

    const write = !["GET", "HEAD", "OPTIONS"].includes(String(request.method).toUpperCase());
    // Crear o modificar usuarios permite darse a sí mismo (o a otro) rol de administrador completo o restablecer contraseñas de administradores: un rol acotado solo puede MIRAR usuarios.
    if (module === "usuarios" && write && /^\/admin\/users/i.test(String(request.originalUrl ?? ""))) {
      throw new ForbiddenException("Crear o modificar usuarios solo lo puede hacer un administrador completo");
    }
    if (!adminPermissionAllows(access.permissions, module, write)) {
      throw new ForbiddenException(write ? "Tu rol solo permite ver esta sección, no modificarla" : "Tu rol no tiene acceso a esta sección");
    }
    return true;
  }
}

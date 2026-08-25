import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PrismaClient } from "@inkademy/db";
import { PRISMA } from "../prisma/prisma.module";
import { COMPANY_ROLES_KEY } from "../decorators/company-roles.decorator";
import type { RequestUser } from "./jwt-auth.guard";
import type { CompanyMembershipRole } from "@inkademy/shared";

/**
 * Guard multi-tenant: toda ruta con :companyId debe pasar por aquí.
 * Verifica que el usuario autenticado tenga una CompanyMembership con
 * status=ACTIVE en esa empresa (o sea ADMIN/SUPPORT global, que puede
 * inspeccionar cualquier empresa con fines de soporte/operación).
 * Adjunta `req.companyMembership` para uso posterior en el controller/service.
 */
@Injectable()
export class CompanyGuard implements CanActivate {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user: RequestUser | undefined = request.user;
    if (!user) throw new ForbiddenException("No autenticado");

    const companyId: string | undefined =
      request.params?.companyId ?? request.params?.id;
    if (!companyId) {
      throw new ForbiddenException("Ruta sin companyId — CompanyGuard mal aplicado");
    }

    const effectiveRoles = user.roles ?? [user.globalRole];
    if (effectiveRoles.includes("ADMIN") || effectiveRoles.includes("SUPPORT")) {
      request.companyMembership = { role: "COMPANY_ADMIN", status: "ACTIVE" };
      return true;
    }

    const membership = await this.prisma.companyMembership.findUnique({
      where: { companyId_userId: { companyId, userId: user.id } },
    });

    if (!membership || membership.status !== "ACTIVE") {
      throw new ForbiddenException("No perteneces a esta empresa");
    }

    const requiredRoles = this.reflector.getAllAndOverride<CompanyMembershipRole[]>(
      COMPANY_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.includes(membership.role)) {
      throw new ForbiddenException(
        `Requiere rol de empresa: ${requiredRoles.join(", ")}`,
      );
    }

    request.companyMembership = membership;
    return true;
  }
}

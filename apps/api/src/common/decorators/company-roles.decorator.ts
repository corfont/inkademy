import { SetMetadata } from "@nestjs/common";
import type { CompanyMembershipRole } from "@inkademy/shared";

export const COMPANY_ROLES_KEY = "companyRoles";

/**
 * Restringe una ruta ya protegida por CompanyGuard a uno o más
 * CompanyMembershipRole (p.ej. COMPANY_ADMIN). Si no se aplica, cualquier
 * miembro activo (COMPANY_ADMIN o PARTICIPANT) puede acceder.
 */
export const CompanyRoles = (...roles: CompanyMembershipRole[]) =>
  SetMetadata(COMPANY_ROLES_KEY, roles);

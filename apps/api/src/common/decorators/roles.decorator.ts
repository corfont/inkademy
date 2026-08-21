import { SetMetadata } from "@nestjs/common";
import type { GlobalRole } from "@inkademy/shared";

export const ROLES_KEY = "roles";

/** Restringe una ruta a uno o más GlobalRole (STUDENT/TEACHER/SUPPORT/ADMIN). */
export const Roles = (...roles: GlobalRole[]) => SetMetadata(ROLES_KEY, roles);

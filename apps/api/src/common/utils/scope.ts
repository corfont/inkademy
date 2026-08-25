import type { RequestUser } from "../guards/jwt-auth.guard";

/**
 * Acota una llamada a "solo lo mío" cuando quien llama es un TEACHER
 * PURO — nunca cuando además tiene ADMIN/SUPPORT entre sus roles (aunque
 * ese no sea su rol principal). Comparar solo contra `user.globalRole`
 * (como se hacía antes en varios controllers) deja a cualquier cuenta con
 * TEACHER como rol SECUNDARIO cayendo en la rama "sin restricción" —
 * viendo/editando recursos de TODOS los docentes en vez de solo los
 * propios (hallazgo de auditoría de seguridad). `RolesGuard`/`CompanyGuard`
 * ya autorizan contra `user.roles` (roles efectivos); este helper usa la
 * misma fuente de verdad para que el scoping de negocio no la contradiga.
 */
export function teacherScopeId(user: RequestUser): string | undefined {
  if (user.roles.includes("ADMIN") || user.roles.includes("SUPPORT")) return undefined;
  return user.roles.includes("TEACHER") ? user.id : undefined;
}

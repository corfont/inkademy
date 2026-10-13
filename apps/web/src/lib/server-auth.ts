import { cookies } from "next/headers";
import { ACCESS_TOKEN_COOKIE, SESSION_COOKIE } from "./auth";

/**
 * SOLO para Server Components / route handlers (importa `next/headers`, que
 * no puede terminar en un bundle de cliente). Lee el access token de la
 * cookie legible `inkademy_at` (ver auth.ts) para poder llamar a la API
 * autenticado desde el servidor.
 *
 * Toda página protegida por autorización (empresa/admin) DEBE pasar este
 * token explícitamente a `companyApi`/`adminApi` — sin él, `apiFetch` no
 * manda `Authorization` en el servidor (no hay `window`/localStorage) y la
 * API responde 401, lo que ahora sí se nota: `withFallback` (ver
 * safe-fetch.ts) relanza los 401/403 en vez de disfrazarlos con datos
 * simulados.
 */
export function getServerAccessToken(): string | null {
  return cookies().get(ACCESS_TOKEN_COOKIE)?.value ?? null;
}

/**
 * Roles de quien mira la pantalla, leídos de la cookie de sesión. SOLO para decidir qué botones mostrar (por ejemplo ocultar «Exportar» a
 * quien la API rechazaría con 403): la autorización real siempre la decide el servidor de la API.
 */
export function getServerUserRoles(): string[] {
  try {
    const raw = cookies().get(SESSION_COOKIE)?.value;
    if (!raw) return [];
    const user = JSON.parse(decodeURIComponent(raw)) as { globalRole?: string; secondaryRoles?: string[] };
    return [user.globalRole, ...(user.secondaryRoles ?? [])].filter((r): r is string => Boolean(r));
  } catch {
    return [];
  }
}

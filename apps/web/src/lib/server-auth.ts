import { cookies } from "next/headers";
import { ACCESS_TOKEN_COOKIE } from "./auth";

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

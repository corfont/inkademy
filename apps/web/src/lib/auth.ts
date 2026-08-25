import type { AuthUser } from "@inkademy/shared";

/**
 * Modelo de sesión del frontend.
 *
 * El contrato (docs/API-CONTRACT.md) entrega el accessToken en el body de
 * /auth/login|register y coloca el refresh token en una cookie httpOnly que
 * gestiona la API (dominio :4000). Para que los Server Components y el
 * middleware de Next puedan leer "¿hay sesión?" sin llamar a la API en cada
 * request, guardamos además:
 *  - `inkademy_at`  → cookie legible (no httpOnly) con el access token, para
 *    poder hacer fetch server-side. Se refresca en el cliente vía /auth/refresh.
 *  - `inkademy_session` → cookie legible con un AuthUser resumido (no datos
 *    sensibles), usada por el middleware para decidir si redirige a /login y
 *    por los layouts protegidos para pintar rol/nombre sin esperar a /auth/me.
 * El accessToken también se guarda en localStorage para uso puramente cliente.
 * Esto es una simplificación razonable mientras apps/api no está desplegada
 * en el mismo dominio; ver IMPLEMENTATION-NOTES.md.
 */

export const ACCESS_TOKEN_COOKIE = "inkademy_at";
export const SESSION_COOKIE = "inkademy_session";
const ACCESS_TOKEN_LOCAL_KEY = "inkademy_access_token";

export function getClientAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_TOKEN_LOCAL_KEY);
}

export function setClientAccessToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCESS_TOKEN_LOCAL_KEY, token);
  document.cookie = `${ACCESS_TOKEN_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${60 * 15}; samesite=lax`;
}

export function clearClientAccessToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_TOKEN_LOCAL_KEY);
  document.cookie = `${ACCESS_TOKEN_COOKIE}=; path=/; max-age=0`;
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
}

export function persistSession(user: AuthUser, accessToken: string) {
  setClientAccessToken(accessToken);
  updateSessionUser(user);
}

/** Actualiza solo el AuthUser cacheado en cookie (p.ej. tras completar el perfil), sin tocar el access token. */
export function updateSessionUser(user: AuthUser) {
  if (typeof document !== "undefined") {
    document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(JSON.stringify(user))}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  }
}

export function readSessionCookie(cookieValue: string | undefined): AuthUser | null {
  if (!cookieValue) return null;
  try {
    return JSON.parse(decodeURIComponent(cookieValue)) as AuthUser;
  } catch {
    return null;
  }
}

/** Prefijos de área protegida por rol — usado por /login y /completar-perfil para decidir si "next" es seguro de seguir. */
const ROLE_AREA_PREFIXES = ["/campus", "/admin", "/docente"];

/**
 * true si `next` apunta al área protegida de un rol DISTINTO al `home` del
 * usuario (p.ej. next="/campus/algo" para un admin, cuyo home es "/admin")
 * — en ese caso no debe seguirse "next" tal cual, porque llevaría a un
 * usuario con la cuenta correcta a ver la pantalla equivocada (bug real:
 * un admin que llegaba a /login con ?next=/campus terminaba viendo el
 * campus de alumno). Un `next` que NO pertenece a ninguna de las tres
 * áreas (p.ej. "/checkout", "/cursos/x") siempre se considera seguro de
 * seguir, para cualquier rol — es el caso legítimo de "volver a donde iba".
 */
export function belongsToOtherRoleArea(next: string, home: string): boolean {
  return ROLE_AREA_PREFIXES.some((prefix) => prefix !== home && (next === prefix || next.startsWith(`${prefix}/`)));
}

import { ApiError } from "./api-client";

/**
 * apps/api se está construyendo en paralelo: durante desarrollo puede no
 * estar disponible. Esta utilidad intenta la llamada real y, si falla por
 * red (API caída/no desplegada — `ApiError.statusCode === 0`), devuelve
 * datos simulados razonables para que la pantalla siga siendo navegable —
 * marcando `live: false` para que la página pueda, si quiere, mostrar un
 * aviso discreto.
 *
 * IMPORTANTE: un 401/403 real de la API NO cae al fallback — se relanza tal
 * cual. Absorber esos errores mostraría "datos de referencia" con apariencia
 * real a un usuario que en realidad no tiene acceso (p. ej. un alumno
 * intentando ver el panel de OTRA empresa, donde la API responde 403
 * correctamente). Las páginas gated por autorización (empresa/admin) tienen
 * un `error.tsx` de segmento que captura ese throw y muestra un estado
 * claro en vez de un panel falso. Otros errores (404, 5xx, red caída) sí
 * siguen cayendo al fallback, para no romper páginas públicas cuando la API
 * todavía no está desplegada o un curso puntual no existe.
 */
export async function withFallback<T>(fn: () => Promise<T>, fallback: T): Promise<{ data: T; live: boolean }> {
  try {
    const data = await fn();
    return { data, live: true };
  } catch (err) {
    if (err instanceof ApiError && (err.statusCode === 401 || err.statusCode === 403)) {
      throw err;
    }
    return { data: fallback, live: false };
  }
}

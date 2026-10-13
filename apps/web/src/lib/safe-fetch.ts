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
/**
 * Los datos de ejemplo (mock-data) son solo para desarrollo: en producción, si la API falla, una página pública NO debe mostrar cursos ni certificados inventados.
 * Se pueden volver a permitir con NEXT_PUBLIC_ALLOW_MOCKS=true (por ejemplo, en una demo sin API).
 */
export const MOCKS_ENABLED = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ALLOW_MOCKS === "true";

/**
 * Opciones de `withFallback` — solo cambian el comportamiento en PRODUCCIÓN
 * (en desarrollo los datos de ejemplo siguen sirviendo, ver MOCKS_ENABLED).
 *
 * - `notFoundOk`: un 404 real es una respuesta válida ("no existe") y cae al
 *   valor de respaldo (típicamente `undefined` → la página llama a `notFound()`).
 * - `soft`: la llamada es secundaria o de una página pública que debe seguir
 *   viéndose aunque la API falle; cae al respaldo ante cualquier error.
 *
 * Sin ninguna de las dos, en producción un fallo de red, un 5xx o un 404
 * se RELANZA: el `error.tsx` del segmento muestra "no pudimos cargar" con
 * Reintentar, en vez de dejar al alumno, la empresa o el administrador
 * mirando datos de ejemplo o una lista vacía que parece real (hallazgo de
 * COMPLETITUD.md: FE-41, TBL-33, DSH-06).
 */
export type FallbackOptions = { notFoundOk?: boolean; soft?: boolean };

export async function withFallback<T>(
  fn: () => Promise<T>,
  fallback: T,
  opts: FallbackOptions = {},
): Promise<{ data: T; live: boolean }> {
  try {
    const data = await fn();
    return { data, live: true };
  } catch (err) {
    if (err instanceof ApiError && (err.statusCode === 401 || err.statusCode === 403)) {
      throw err;
    }
    if (!MOCKS_ENABLED && !opts.soft && !(opts.notFoundOk && err instanceof ApiError && err.statusCode === 404)) {
      throw err;
    }
    return { data: fallback, live: false };
  }
}

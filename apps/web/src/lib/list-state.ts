/**
 * Estado de un listado en la URL (COMPLETITUD.md: TBL-13): búsqueda, filtros, orden y página viven en la dirección, así que se pueden
 * compartir, sobreviven a recargar y al botón Atrás. Módulo SIN "use client": lo usan páginas de servidor y componentes de cliente por igual.
 */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Parámetros no vacíos como un objeto plano (si un parámetro viene repetido se toma el primero). */
export function flattenParams(sp: RawSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    const value = Array.isArray(v) ? v[0] : v;
    if (value !== undefined && value !== "") out[k] = value;
  }
  return out;
}

/** Dirección del listado con los parámetros actuales más los cambios pedidos (`undefined` o vacío = quitar ese parámetro). */
export function listHref(basePath: string, current: Record<string, string>, changes: Record<string, string | number | undefined> = {}): string {
  const merged: Record<string, string> = { ...current };
  for (const [k, v] of Object.entries(changes)) {
    if (v === undefined || v === "") delete merged[k];
    else merged[k] = String(v);
  }
  const qs = new URLSearchParams(merged).toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

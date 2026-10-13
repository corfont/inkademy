/**
 * Base común de todo listado administrable con filtros, orden y paginación en el SERVIDOR (COMPLETITUD.md: TBL-10..20).
 * Cada pantalla declara qué columnas se pueden ordenar y qué filtros acepta; esto normaliza el resto (página, tamaño, dirección)
 * y rechaza valores raros en vez de pasarlos a la consulta.
 */
export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_LIST_PAGE_SIZE = 25;

export interface ListQuery<S extends string> {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  sort: S;
  dir: "asc" | "desc";
}

export function parseListQuery<S extends string>(
  raw: { page?: unknown; pageSize?: unknown; sort?: unknown; dir?: unknown },
  opts: { sortable: readonly S[]; defaultSort: S; defaultDir?: "asc" | "desc" },
): ListQuery<S> {
  const page = Math.max(1, Math.floor(Number(raw.page)) || 1);
  const requested = Math.floor(Number(raw.pageSize)) || DEFAULT_LIST_PAGE_SIZE;
  // Solo los tamaños que ofrece la pantalla: un pageSize arbitrario (10000) no debe llegar a la base.
  const pageSize = (PAGE_SIZES as readonly number[]).includes(requested) ? requested : DEFAULT_LIST_PAGE_SIZE;
  const sort = (opts.sortable as readonly string[]).includes(String(raw.sort)) ? (String(raw.sort) as S) : opts.defaultSort;
  const dir = raw.dir === "asc" || raw.dir === "desc" ? raw.dir : opts.defaultDir ?? "desc";
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize, sort, dir };
}

/** Fecha de calendario (YYYY-MM-DD) → inicio y fin de ESE día en hora de Lima (UTC-5, sin horario de verano), para filtrar marcas de tiempo reales. */
export function limaDayRange(from?: string, to?: string): { gte?: Date; lte?: Date } {
  const ok = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const f = ok(from);
  const t = ok(to);
  const range: { gte?: Date; lte?: Date } = {};
  if (f) range.gte = new Date(`${f}T00:00:00.000-05:00`);
  // El día final se incluye ENTERO (con `new Date("YYYY-MM-DD")` el último día quedaba fuera).
  if (t) range.lte = new Date(`${t}T23:59:59.999-05:00`);
  return range;
}

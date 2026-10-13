import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { listHref } from "@/lib/list-state";
import { cn } from "@/lib/cn";

export interface DataColumn<T> {
  key: string;
  header: string;
  /** Si existe, el encabezado ordena por esta clave en el SERVIDOR (enlace, funciona sin JavaScript). */
  sortKey?: string;
  /** Dirección del primer clic en esta columna (fechas y montos suelen querer «desc» primero). */
  firstDir?: "asc" | "desc";
  align?: "left" | "right";
  cell: (row: T) => ReactNode;
}

/**
 * Tabla de datos única del sistema (COMPLETITUD.md: TBL-12, 22, 27, 28, 50): encabezado fijo con orden por columna (`aria-sort`, flechas),
 * montos a la derecha, `<caption>` accesible, fila de totales opcional y desplazamiento horizontal sin romper la página. Es un componente de
 * SERVIDOR: el orden son enlaces, así que el estado vive en la URL. La paginación, los filtros y la exportación son componentes hermanos.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  basePath,
  params,
  sort,
  dir,
  caption,
  empty,
  footer,
}: {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  basePath: string;
  /** Parámetros actuales de la URL (para conservar filtros y búsqueda al ordenar). */
  params: Record<string, string>;
  sort?: string;
  dir?: "asc" | "desc";
  caption: string;
  empty: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-paper-border bg-paper">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-10 border-b border-paper-border bg-paper text-ash-500">
          <tr>
            {columns.map((c) => {
              const active = c.sortKey !== undefined && c.sortKey === sort;
              const nextDir = active ? (dir === "asc" ? "desc" : "asc") : c.firstDir ?? "asc";
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={c.sortKey ? (active ? (dir === "asc" ? "ascending" : "descending") : "none") : undefined}
                  className={cn("whitespace-nowrap p-4 font-medium", c.align === "right" && "text-right")}
                >
                  {c.sortKey ? (
                    <Link
                      href={listHref(basePath, params, { sort: c.sortKey, dir: nextDir, page: undefined })}
                      className={cn("inline-flex items-center gap-1 hover:text-ink-900", active && "text-ink-900")}
                    >
                      {c.header}
                      {active ? (
                        dir === "asc" ? <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden="true" />
                      )}
                      <span className="sr-only">{active ? (dir === "asc" ? ", orden ascendente" : ", orden descendente") : ", ordenar"}</span>
                    </Link>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length}>{empty}</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-paper-border last:border-0 hover:bg-paper-muted">
                {columns.map((c) => (
                  <td key={c.key} className={cn("p-4 text-ash-700", c.align === "right" && "text-right tabular-nums")}>
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {footer && <tfoot className="border-t border-paper-border bg-paper-muted text-ink-900">{footer}</tfoot>}
      </table>
    </div>
  );
}

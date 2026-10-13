import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { listHref } from "@/lib/list-state";
import { PageSizeSelect } from "./PageSizeSelect";
import { cn } from "@/lib/cn";

/** Ventana de páginas: la primera, la última y las vecinas de la actual, con «…» donde se salta. */
function pageWindow(page: number, pages: number): (number | "gap")[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

/**
 * Paginación única del sistema (COMPLETITUD.md: TBL-20): rango mostrado y total, páginas numeradas, anterior/siguiente y tamaño de página.
 * Basada en enlaces (el estado vive en la URL, funciona sin JavaScript). Nunca recorta en silencio: el total siempre se ve.
 */
export function Pagination({
  basePath,
  params,
  page,
  pageSize,
  total,
}: {
  basePath: string;
  params: Record<string, string>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const link = "inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-paper-border px-2 text-sm hover:bg-paper-muted";

  return (
    <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-3 text-sm text-ash-600">
      <p aria-live="polite">
        {total === 0 ? "0 resultados" : `Mostrando ${from.toLocaleString("es-PE")}–${to.toLocaleString("es-PE")} de ${total.toLocaleString("es-PE")}`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <PageSizeSelect basePath={basePath} params={params} pageSize={pageSize} />
        {pages > 1 && (
          <ul className="flex items-center gap-1">
            <li>
              {page > 1 ? (
                <Link href={listHref(basePath, params, { page: page - 1 })} className={link} aria-label="Página anterior">
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Link>
              ) : (
                <span className={cn(link, "pointer-events-none opacity-40")} aria-hidden="true"><ChevronLeft className="h-4 w-4" /></span>
              )}
            </li>
            {pageWindow(page, pages).map((p, i) =>
              p === "gap" ? (
                <li key={`gap-${i}`} aria-hidden="true" className="px-1">…</li>
              ) : (
                <li key={p}>
                  <Link
                    href={listHref(basePath, params, { page: p === 1 ? undefined : p })}
                    aria-current={p === page ? "page" : undefined}
                    aria-label={`Página ${p}`}
                    className={cn(link, p === page && "border-ink-900 bg-ink-900 text-paper hover:bg-ink-900")}
                  >
                    {p}
                  </Link>
                </li>
              ),
            )}
            <li>
              {page < pages ? (
                <Link href={listHref(basePath, params, { page: page + 1 })} className={link} aria-label="Página siguiente">
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              ) : (
                <span className={cn(link, "pointer-events-none opacity-40")} aria-hidden="true"><ChevronRight className="h-4 w-4" /></span>
              )}
            </li>
          </ul>
        )}
      </div>
    </nav>
  );
}

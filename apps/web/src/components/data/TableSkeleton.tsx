/** Esqueleto de una pantalla de listado (COMPLETITUD.md: TBL-30): reserva el espacio para que la página no salte al cargar. */
export function TableSkeleton({ rows = 8, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="flex flex-col gap-4" role="status" aria-live="polite" aria-label="Cargando">
      <div className="h-8 w-48 animate-pulse rounded bg-paper-muted" />
      <div className="flex gap-3">
        <div className="h-11 w-64 animate-pulse rounded bg-paper-muted" />
        <div className="h-11 w-40 animate-pulse rounded bg-paper-muted" />
      </div>
      <div className="overflow-hidden rounded-lg border border-paper-border bg-paper">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-4 border-b border-paper-border p-4 last:border-0">
            {Array.from({ length: columns }).map((__, c) => (
              <div key={c} className="h-4 flex-1 animate-pulse rounded bg-paper-muted" />
            ))}
          </div>
        ))}
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}

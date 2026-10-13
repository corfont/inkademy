import type { ReactNode } from "react";

/**
 * Estado vacío con ilustración, explicación y una acción (COMPLETITUD.md: TBL-31/32, FE-40). Un solo componente para toda pantalla:
 * «sin resultados de un filtro» y «todavía no hay nada» se dicen distinto pero se ven igual de cuidados.
 */
export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
      <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden="true" className="text-ash-300">
        <rect x="10" y="16" width="52" height="40" rx="6" stroke="currentColor" strokeWidth="2.5" />
        <path d="M10 28h52" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="18" cy="22" r="1.8" fill="currentColor" />
        <circle cx="25" cy="22" r="1.8" fill="currentColor" />
        <path d="M26 42h20M30 48h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <p className="font-serif text-lg font-semibold text-ink-900">{title}</p>
      {description && <p className="max-w-sm text-sm text-ash-600">{description}</p>}
      {action}
    </div>
  );
}

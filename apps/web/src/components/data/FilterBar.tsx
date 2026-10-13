import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Barra de filtros única (COMPLETITUD.md: TBL-10/11): un formulario GET (el estado vive en la URL, funciona sin JavaScript) con los campos que
 * pase cada pantalla, «Aplicar» y «Limpiar filtros» con el conteo de filtros activos. Conserva el orden elegido y vuelve a la página 1.
 */
export function FilterBar({
  basePath,
  params,
  filterKeys,
  keepSort = true,
  children,
}: {
  basePath: string;
  params: Record<string, string>;
  /** Parámetros que son filtros (para contarlos y para saber qué limpiar). */
  filterKeys: string[];
  /** false si la pantalla trae su propio selector de orden (vistas sin encabezados clicables). */
  keepSort?: boolean;
  children: ReactNode;
}) {
  const active = filterKeys.filter((k) => params[k]).length;
  return (
    <form method="get" action={basePath} role="search" className="flex flex-wrap items-end gap-3">
      {keepSort && params.sort && <input type="hidden" name="sort" value={params.sort} />}
      {keepSort && params.dir && <input type="hidden" name="dir" value={params.dir} />}
      {params.pageSize && <input type="hidden" name="pageSize" value={params.pageSize} />}
      {children}
      <Button type="submit" variant="outline">Aplicar</Button>
      {active > 0 && (
        <>
          <Link href={basePath} className="text-sm font-medium text-indigo-600 hover:underline">Limpiar filtros</Link>
          <span className="text-xs text-ash-500">{active} {active === 1 ? "filtro activo" : "filtros activos"}</span>
        </>
      )}
    </form>
  );
}

/** Campo de filtro con etiqueta visible (nunca solo placeholder). */
export function FilterField({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs font-medium text-ash-600">{label}</label>
      {children}
    </div>
  );
}

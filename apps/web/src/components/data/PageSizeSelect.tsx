"use client";

import { useRouter } from "next/navigation";
import { listHref, PAGE_SIZE_OPTIONS } from "@/lib/list-state";

/** Selector de filas por página: cambia el tamaño y vuelve a la página 1 (la única pieza de la paginación que necesita JavaScript). */
export function PageSizeSelect({ basePath, params, pageSize }: { basePath: string; params: Record<string, string>; pageSize: number }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2">
      <span className="text-ash-500">Filas</span>
      <select
        value={pageSize}
        onChange={(e) => router.push(listHref(basePath, params, { pageSize: e.target.value, page: undefined }))}
        className="h-9 rounded-md border border-paper-border bg-paper px-2 text-sm text-ash-800"
      >
        {PAGE_SIZE_OPTIONS.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </label>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, ApiError } from "@/lib/api-client";
import { Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { localize, formatDate } from "@/lib/format";

/**
 * "Deberían aparecer más abajo todas las cortesías que se han realizado
 * con fecha, el administrador que dio la autorización, la empresa/persona
 * beneficiada, el curso, etc., y tener la opción de ordenar por año, por
 * curso, por habilidad... y poder eliminar si uno ya no lo quiere
 * visualizar, uno a uno o en bloque." — "eliminar" acá es limpiar el
 * historial (borra el registro de auditoría), NO revoca el acceso ya
 * otorgado — eso se hace desde /admin/matriculas o /admin/empresas si hiciera falta.
 */
export function CourtesyGrantsHistory({ grants, areas }: { grants: any[]; areas: any[] }) {
  const router = useRouter();
  const [sortBy, setSortBy] = useState<"date" | "course" | "area">("date");
  const [areaFilter, setAreaFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let rows = areaFilter ? grants.filter((g) => g.areaSlug === areaFilter) : grants;
    rows = [...rows].sort((a, b) => {
      if (sortBy === "course") return localize(a.offeringTitle, "es").localeCompare(localize(b.offeringTitle, "es"));
      if (sortBy === "area") return (a.areaName?.es ?? "").localeCompare(b.areaName?.es ?? "");
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return rows;
  }, [grants, areaFilter, sortBy]);

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete(ids: string[]) {
    if (ids.length === 0) return;
    if (!confirm(ids.length === 1 ? "¿Quitar esta cortesía del historial?" : `¿Quitar ${ids.length} cortesías del historial?`)) return;
    setBusy(true);
    setError(null);
    try {
      await adminApi.deleteCourtesyGrants(ids);
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ocurrió un error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Callout variant="danger">{error}</Callout>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-lg font-semibold text-ink-900">Historial de cortesías</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Select className="h-9 w-40 text-sm" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
            <option value="date">Ordenar por fecha</option>
            <option value="course">Ordenar por curso</option>
            <option value="area">Ordenar por habilidad</option>
          </Select>
          <Select className="h-9 w-48 text-sm" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
            <option value="">Todas las áreas/habilidades</option>
            {areas.map((a: any) => (
              <option key={a.slug} value={a.slug}>
                {a.name?.es ?? a.slug}
              </option>
            ))}
          </Select>
          {selected.size > 0 && (
            <Button size="sm" variant="outline" className="text-danger" disabled={busy} onClick={() => handleDelete([...selected])}>
              Eliminar {selected.size} seleccionadas
            </Button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-ash-500">Todavía no se ha otorgado ninguna cortesía.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-paper-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-paper-border bg-paper-muted text-xs uppercase tracking-wide text-ash-500">
                <th className="w-8 p-3"></th>
                <th className="p-3">Fecha</th>
                <th className="p-3">Curso/programa</th>
                <th className="p-3">Beneficiario</th>
                <th className="p-3">Autorizó</th>
                <th className="p-3">Nota</th>
                <th className="w-10 p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-border">
              {filtered.map((g) => (
                <tr key={g.id}>
                  <td className="p-3">
                    <input type="checkbox" checked={selected.has(g.id)} onChange={() => toggle(g.id)} />
                  </td>
                  <td className="whitespace-nowrap p-3 text-ash-600">{formatDate(g.createdAt, "es")}</td>
                  <td className="p-3 font-medium text-ink-900">{localize(g.offeringTitle, "es")}</td>
                  <td className="p-3">
                    {g.beneficiaryType === "COMPANY" ? (
                      <Badge variant="outline">Empresa: {g.beneficiaryName}{g.seatPoolQty ? ` · ${g.seatPoolQty} cupos` : ""}</Badge>
                    ) : (
                      g.beneficiaryName
                    )}
                  </td>
                  <td className="p-3 text-ash-600">{g.authorizedBy}</td>
                  <td className="p-3 text-ash-500">{g.note ?? "—"}</td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="ghost" className="text-ash-400 hover:text-danger" disabled={busy} onClick={() => handleDelete([g.id])}>
                      Eliminar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

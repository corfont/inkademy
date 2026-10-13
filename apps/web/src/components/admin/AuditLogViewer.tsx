"use client";

import { useEffect, useState } from "react";
import { AUDIT_ENTITY_LABEL, AUDIT_KNOWN_ENTITIES, auditActionLabel } from "@inkademy/shared";
import { adminApi, ApiError, type AuditLogEntryDTO } from "@/lib/api-client";
import { ExportButtons } from "@/components/data/ExportButtons";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

// Etiquetas y entidades auditables: viven en @inkademy/shared (las usa también la exportación del servidor).
const KNOWN_ENTITIES = AUDIT_KNOWN_ENTITIES;
const ENTITY_LABEL = AUDIT_ENTITY_LABEL;
const accionLegible = auditActionLabel;

const FIELD_LABEL: Record<string, string> = {
  role: "Rol",
  roles: "Roles",
  secondaryRoles: "Roles adicionales",
  status: "Estado",
  active: "Activo",
  name: "Nombre",
  title: "Título",
  email: "Correo",
  userEmail: "Correo del beneficiario",
  note: "Nota",
  changedFields: "Campos modificados",
  igvPercent: "IGV (%)",
  igvRate: "IGV (%)",
  commissionPercent: "Comisión (%)",
  feeAmount: "Monto del convenio",
  feeCurrency: "Moneda",
  startsAt: "Inicio",
  endsAt: "Fin",
  reason: "Motivo",
};
const campoLegible = (k: string) => FIELD_LABEL[k] ?? k.replace(/([A-Z])/g, " $1").replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
const valorLegible = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

/** Qué cambió, campo por campo: solo lo distinto entre «antes» y «después» (o, si no hay «antes», lo registrado). */
function cambios(before: unknown, after: unknown): { campo: string; antes: string; despues: string }[] {
  const b = before && typeof before === "object" ? (before as Record<string, unknown>) : {};
  const a = after && typeof after === "object" ? (after as Record<string, unknown>) : {};
  const claves = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  return claves
    .filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]))
    .map((k) => ({ campo: campoLegible(k), antes: valorLegible(b[k]), despues: valorLegible(a[k]) }));
}

/**
 * "Así como se puede migrar también se debería de poder visualizar o
 * alguna manera de bucear en el histórico" — pantalla genérica sobre
 * AuditLog (antes solo existía CourtesyGrantsHistory, angosta a una sola
 * acción). A diferencia de esa, acá NO se resuelven nombres legibles para
 * entity/entityId (Course→título, User→nombre, etc.) — son strings sueltos
 * sin relación real en Prisma, y resolverlos para cualquier entidad
 * agregaría una consulta batcheada por tipo; se deja el id crudo a
 * propósito para cubrir todo sin ese costo de mantenimiento.
 */
export function AuditLogViewer() {
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [actorQ, setActorQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<AuditLogEntryDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [applied, setApplied] = useState<Record<string, string>>({});

  const pageSize = 30;

  async function load(nextPage = page) {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.auditLog({ entity: entity || undefined, action: action || undefined, actorQ: actorQ.trim() || undefined, from: from || undefined, to: to || undefined, page: nextPage, pageSize });
      setRows(result.rows);
      setTotal(result.total);
      setPage(nextPage);
      setApplied({ entity, action: action.trim(), actorQ: actorQ.trim(), from, to });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el historial.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-serif text-lg font-semibold text-ink-900">Auditoría</h2>
        <p className="mt-1 text-sm text-ash-500">Historial de acciones administrativas sensibles (convenios, liquidaciones, usuarios, órdenes, etc.) — quién hizo qué y cuándo.</p>
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-5">
          <div>
            <Label htmlFor="al-entity">Entidad</Label>
            <Select id="al-entity" value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="">Todas</option>
              {KNOWN_ENTITIES.map((e) => (
                <option key={e} value={e}>
                  {ENTITY_LABEL[e] ?? e}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="al-action">Acción (contiene)</Label>
            <Input id="al-action" value={action} onChange={(e) => setAction(e.target.value)} placeholder="Código técnico, ej. DELETE o GRANT" />
          </div>
          <div>
            <Label htmlFor="al-actor">Usuario (nombre o correo)</Label>
            <Input id="al-actor" value={actorQ} onChange={(e) => setActorQ(e.target.value)} placeholder="Quién hizo la acción" />
          </div>
          <div>
            <Label htmlFor="al-from">Desde</Label>
            <Input id="al-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="al-to">Hasta</Label>
            <Input id="al-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-5">
            <Button size="sm" disabled={loading} onClick={() => load(1)}>
              {loading ? "Buscando…" : "Filtrar"}
            </Button>
            {/* Descarga el MISMO conjunto filtrado (con los filtros que se aplicaron al buscar, no los que se están escribiendo). */}
            <ExportButtons
              path="audit-log/export"
              params={Object.fromEntries(Object.entries(applied).filter(([, v]) => v)) as Record<string, string>}
            />
          </div>
        </CardContent>
      </Card>

      {error && <Callout variant="danger">{error}</Callout>}

      {rows.length === 0 && !loading ? (
        <p className="text-sm text-ash-500">No hay eventos con estos filtros.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-col gap-2 p-4">
                <button
                  type="button"
                  className="flex flex-wrap items-center justify-between gap-2 text-left"
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                >
                  <div>
                    <span className="text-sm font-medium text-ink-900">{accionLegible(r.action)}</span>
                    <span className="ml-2 text-xs text-ash-500">
                      {ENTITY_LABEL[r.entity] ?? r.entity}
                      {r.entityLabel ? `: ${r.entityLabel}` : r.entityId ? ` · ${r.entityId.slice(0, 8)}…` : ""}
                    </span>
                  </div>
                  <span className="text-xs text-ash-500">
                    {new Date(r.createdAt).toLocaleString("es-PE")}
                    {r.actor && ` · ${r.actor.firstName} ${r.actor.lastName}`}
                  </span>
                </button>
                {expandedId === r.id && (
                  <div className="flex flex-col gap-3 border-t border-paper-border pt-2">
                    {cambios(r.before, r.after).length > 0 ? (
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="text-ash-500">
                            <th className="py-1 pr-3 font-medium">Qué cambió</th>
                            <th className="py-1 pr-3 font-medium">Antes</th>
                            <th className="py-1 font-medium">Después</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cambios(r.before, r.after).map((c) => (
                            <tr key={c.campo} className="border-t border-paper-border">
                              <td className="py-1 pr-3 font-medium text-ink-800">{c.campo}</td>
                              <td className="py-1 pr-3 text-ash-600">{c.antes}</td>
                              <td className="py-1 text-ink-900">{c.despues}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-xs text-ash-500">Este registro no guarda un detalle de campos.</p>
                    )}
                    <details className="text-xs text-ash-500">
                      <summary className="cursor-pointer">Detalle técnico</summary>
                      <p className="mt-1">
                        Código: <code>{r.action}</code> · Tipo: <code>{r.entity}</code>
                        {r.entityId ? <> · Id: <code>{r.entityId}</code></> : null}
                      </p>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        <pre className="overflow-auto rounded-md bg-paper-muted p-2">{JSON.stringify(r.before ?? null, null, 2)}</pre>
                        <pre className="overflow-auto rounded-md bg-paper-muted p-2">{JSON.stringify(r.after ?? null, null, 2)}</pre>
                      </div>
                    </details>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {total > pageSize && (
        <div className="flex items-center justify-center gap-3">
          <Button size="sm" variant="outline" disabled={loading || page <= 1} onClick={() => load(page - 1)}>
            Anterior
          </Button>
          <span className="text-xs text-ash-500" aria-live="polite">
            {((page - 1) * pageSize + 1).toLocaleString("es-PE")}–{Math.min(total, page * pageSize).toLocaleString("es-PE")} de {total.toLocaleString("es-PE")} · página {page} de {Math.ceil(total / pageSize)}
          </span>
          <Button size="sm" variant="outline" disabled={loading || page * pageSize >= total} onClick={() => load(page + 1)}>
            Siguiente
          </Button>
        </div>
      )}
    </div>
  );
}

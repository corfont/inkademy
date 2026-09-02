"use client";

import { useEffect, useState } from "react";
import { adminApi, ApiError, type AuditLogEntryDTO } from "@/lib/api-client";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

// Entidades que de verdad se auditan hoy (logAudit() en apps/api) — un
// select libre mostraría decenas de valores sin sentido para el resto de
// los 64 modelos que nunca escriben a AuditLog.
const KNOWN_ENTITIES = [
  "PartnerInstitution",
  "CoursePartnership",
  "TeacherLiquidation",
  "User",
  "Course",
  "Area",
  "Company",
  "Order",
  "RoyaltyRecipient",
  "CourseRoyalty",
  "PlatformSettings",
  "SunatSettings",
  "EmailServerSettings",
  "LiveSession",
];

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
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<AuditLogEntryDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const pageSize = 30;

  async function load(nextPage = page) {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.auditLog({ entity: entity || undefined, action: action || undefined, from: from || undefined, to: to || undefined, page: nextPage, pageSize });
      setRows(result.rows);
      setTotal(result.total);
      setPage(nextPage);
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
        <CardContent className="grid gap-3 p-4 sm:grid-cols-4">
          <div>
            <Label htmlFor="al-entity">Entidad</Label>
            <Select id="al-entity" value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="">Todas</option>
              {KNOWN_ENTITIES.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="al-action">Acción (contiene)</Label>
            <Input id="al-action" value={action} onChange={(e) => setAction(e.target.value)} placeholder="Ej. DELETE" />
          </div>
          <div>
            <Label htmlFor="al-from">Desde</Label>
            <Input id="al-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="al-to">Hasta</Label>
            <Input id="al-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="sm:col-span-4">
            <Button size="sm" disabled={loading} onClick={() => load(1)}>
              {loading ? "Buscando…" : "Filtrar"}
            </Button>
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
                    <span className="text-sm font-medium text-ink-900">{r.action}</span>
                    <span className="ml-2 text-xs text-ash-500">
                      {r.entity}
                      {r.entityId ? ` · ${r.entityId}` : ""}
                    </span>
                  </div>
                  <span className="text-xs text-ash-500">
                    {new Date(r.createdAt).toLocaleString("es-PE")}
                    {r.actor && ` · ${r.actor.firstName} ${r.actor.lastName}`}
                  </span>
                </button>
                {expandedId === r.id && (
                  <div className="grid gap-3 border-t border-paper-border pt-2 sm:grid-cols-2">
                    <div>
                      <p className="mb-1 text-xs font-medium text-ash-600">Antes</p>
                      <pre className="overflow-auto rounded-md bg-paper-muted p-2 text-xs">{JSON.stringify(r.before ?? null, null, 2)}</pre>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-ash-600">Después</p>
                      <pre className="overflow-auto rounded-md bg-paper-muted p-2 text-xs">{JSON.stringify(r.after ?? null, null, 2)}</pre>
                    </div>
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
          <span className="text-xs text-ash-500">
            Página {page} de {Math.ceil(total / pageSize)}
          </span>
          <Button size="sm" variant="outline" disabled={loading || page * pageSize >= total} onClick={() => load(page + 1)}>
            Siguiente
          </Button>
        </div>
      )}
    </div>
  );
}

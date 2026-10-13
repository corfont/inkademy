import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, ClipboardList } from "lucide-react";
import { adminApi, type AdminComplaintsPage } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { flattenParams, listHref, type RawSearchParams } from "@/lib/list-state";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Input";
import { ExportButtons } from "@/components/data/ExportButtons";
import { FilterBar, FilterField } from "@/components/data/FilterBar";
import { Pagination } from "@/components/data/Pagination";
import { ComplaintsManager } from "@/components/admin/ComplaintsManager";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Reclamos (admin)" };

const BASE = "/admin/reclamos";
const FILTER_KEYS = ["q", "status", "kind", "overdue", "from", "to"];
const EMPTY: AdminComplaintsPage = { rows: [], total: 0, page: 1, pageSize: 25, sort: "attention", dir: "asc" };

const SORT_OPTIONS: [string, string][] = [
  ["attention", "Más urgentes primero"],
  ["created", "Fecha de registro"],
  ["due", "Plazo de respuesta"],
  ["status", "Estado"],
  ["kind", "Tipo"],
];

export default async function AdminComplaintsPage({ searchParams }: { searchParams: RawSearchParams }) {
  const accessToken = getServerAccessToken();
  const params = flattenParams(searchParams);

  const [{ data: result }, { data: summary }] = await Promise.all([
    withFallback(() => adminApi.complaints(params, accessToken), EMPTY),
    withFallback(() => adminApi.complaintsSummary(accessToken), { total: 0, pending: 0, overdue: 0, responded: 0 }),
  ]);

  const filtersActive = FILTER_KEYS.some((k) => params[k]);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const onlyKey = (k: string) => FILTER_KEYS.filter((x) => params[x]).length === 1 && params[k];

  // Tarjetas clicables: el plazo legal es de 15 días hábiles, así que «plazo vencido» es lo primero que se mira.
  const cards = [
    { label: "Plazo vencido", value: summary.overdue, icon: AlertTriangle, accent: "bg-danger-bg text-danger", changes: { overdue: "1" }, active: Boolean(onlyKey("overdue")) },
    { label: "Sin responder", value: summary.pending, icon: Clock, accent: "bg-gold-100 text-gold-700", changes: { status: "PENDING" }, active: params.status === "PENDING" && !params.overdue },
    { label: "Respondidos", value: summary.responded, icon: CheckCircle2, accent: "bg-success-bg text-success", changes: { status: "RESPONDED" }, active: params.status === "RESPONDED" },
    { label: "Total del libro", value: summary.total, icon: ClipboardList, accent: "bg-paper-muted text-ash-700", changes: {}, active: !filtersActive },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink-900">Libro de Reclamaciones</h1>
          <p className="mt-1 max-w-3xl text-sm text-ash-500">
            Reclamos y quejas que llegan del formulario público (/libro-de-reclamaciones). La ley da 15 días hábiles para responder; la respuesta se envía al consumidor por correo.
            Por defecto se muestran primero los que hay que atender antes.
          </p>
        </div>
        <ExportButtons path="complaints/export" params={params} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={listHref(BASE, {}, c.changes)}
            aria-label={`${c.label}: ${c.value}. Ver el detalle`}
            aria-current={c.active ? "true" : undefined}
            className="rounded-lg focus-visible:outline-2 focus-visible:outline-ink-500"
          >
            <Card className={cn("h-full transition-shadow hover:shadow-raised", c.active && "ring-2 ring-ink-900")}>
              <CardContent className="p-5">
                <span className={`flex h-10 w-10 items-center justify-center rounded-full ${c.accent}`}>
                  <c.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="mt-3 font-serif text-2xl font-semibold text-ink-900">{c.value.toLocaleString("es-PE")}</p>
                <p className="text-sm text-ash-500">{c.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <FilterBar basePath={BASE} params={params} filterKeys={FILTER_KEYS} keepSort={false}>
        <FilterField label="Buscar" htmlFor="f-q">
          <Input id="f-q" name="q" defaultValue={params.q ?? ""} placeholder="Folio, nombre, documento, correo o servicio" className="w-72" />
        </FilterField>
        <FilterField label="Estado" htmlFor="f-status">
          <Select id="f-status" name="status" defaultValue={params.status ?? ""} className="w-40">
            <option value="">Todos</option>
            <option value="PENDING">Sin responder</option>
            <option value="RESPONDED">Respondido</option>
          </Select>
        </FilterField>
        <FilterField label="Tipo" htmlFor="f-kind">
          <Select id="f-kind" name="kind" defaultValue={params.kind ?? ""} className="w-36">
            <option value="">Todos</option>
            <option value="RECLAMO">Reclamo</option>
            <option value="QUEJA">Queja</option>
          </Select>
        </FilterField>
        <FilterField label="Plazo" htmlFor="f-overdue">
          <Select id="f-overdue" name="overdue" defaultValue={params.overdue ?? ""} className="w-44">
            <option value="">Todos</option>
            <option value="1">Solo plazo vencido</option>
          </Select>
        </FilterField>
        <FilterField label="Registrado desde" htmlFor="f-from">
          <Input id="f-from" type="date" name="from" defaultValue={params.from ?? ""} className="w-40" />
        </FilterField>
        <FilterField label="Registrado hasta" htmlFor="f-to">
          <Input id="f-to" type="date" name="to" defaultValue={params.to ?? ""} className="w-40" />
        </FilterField>
        <FilterField label="Ordenar por" htmlFor="f-sort">
          <Select id="f-sort" name="sort" defaultValue={result.sort} className="w-48">
            {SORT_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Sentido" htmlFor="f-dir">
          <Select id="f-dir" name="dir" defaultValue={result.dir} className="w-36">
            <option value="asc">Ascendente</option>
            <option value="desc">Descendente</option>
          </Select>
        </FilterField>
      </FilterBar>

      {result.rows.length === 0 ? (
        <div className="rounded-lg border border-paper-border bg-paper">
          {result.total > 0 ? (
            <EmptyState
              title="Esta página no tiene resultados"
              description={`Hay ${pages} ${pages === 1 ? "página" : "páginas"} de resultados.`}
              action={<Link href={listHref(BASE, params, { page: undefined })} className="text-sm font-medium text-indigo-600 hover:underline">Ir a la primera página</Link>}
            />
          ) : filtersActive ? (
            <EmptyState
              title="No hay registros con estos filtros"
              description={params.overdue === "1" && onlyKey("overdue") ? "No hay reclamos con el plazo vencido: todo está dentro de plazo." : "Prueba con otro texto, estado o rango de fechas."}
              action={<Link href={BASE} className="text-sm font-medium text-indigo-600 hover:underline">Limpiar filtros</Link>}
            />
          ) : (
            <EmptyState title="Todavía no hay reclamos ni quejas" description="Cuando alguien use el Libro de Reclamaciones, el registro aparecerá aquí con su plazo de respuesta." />
          )}
        </div>
      ) : (
        <ComplaintsManager complaints={result.rows} />
      )}

      <Pagination basePath={BASE} params={params} page={result.page} pageSize={result.pageSize} total={result.total} />
    </div>
  );
}

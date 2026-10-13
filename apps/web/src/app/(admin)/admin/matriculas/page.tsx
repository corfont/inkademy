import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ClipboardList, PlayCircle } from "lucide-react";
import { getLocale } from "next-intl/server";
import { adminApi, type AdminEnrollmentsPage } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { flattenParams, listHref, type RawSearchParams } from "@/lib/list-state";
import { ENROLLMENT_SOURCE_LABEL, ENROLLMENT_STATUS_LABEL, ENROLLMENT_STATUS_VARIANT } from "@/lib/labels";
import { formatDate, localize } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Input";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { ExportButtons } from "@/components/data/ExportButtons";
import { FilterBar, FilterField } from "@/components/data/FilterBar";
import { Pagination } from "@/components/data/Pagination";
import { ExtendAccessControl } from "@/components/admin/ExtendAccessControl";
import { ResetProgressControl } from "@/components/admin/ResetProgressControl";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Matrículas (admin)" };

const BASE = "/admin/matriculas";
const FILTER_KEYS = ["q", "status", "kind", "expired", "from", "to"];
const EMPTY: AdminEnrollmentsPage = { rows: [], total: 0, page: 1, pageSize: 25, sort: "enrolled", dir: "desc" };

type Row = AdminEnrollmentsPage["rows"][number];

export default async function AdminEnrollmentsPage({ searchParams }: { searchParams: RawSearchParams }) {
  const locale = await getLocale();
  const accessToken = getServerAccessToken();
  const params = flattenParams(searchParams);

  const [{ data: result }, { data: summary }] = await Promise.all([
    withFallback(() => adminApi.enrollments(params, accessToken), EMPTY),
    withFallback(() => adminApi.enrollmentsSummary(accessToken), { total: 0, active: 0, completed: 0, expired: 0, extemporaneous: 0 }),
  ]);

  const filtersActive = FILTER_KEYS.some((k) => params[k]);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));

  // Tarjetas clicables: cada una aplica su filtro. «Casos extemporáneos» = plazo vencido y sin terminar (lo que antes era la vista por defecto).
  const cards = [
    { label: "Casos extemporáneos", value: summary.extemporaneous, icon: AlertTriangle, accent: "bg-danger-bg text-danger", changes: { expired: "1" }, active: params.expired === "1" },
    { label: "Activas", value: summary.active, icon: PlayCircle, accent: "bg-success-bg text-success", changes: { status: "ACTIVE" }, active: params.status === "ACTIVE" },
    { label: "Completadas", value: summary.completed, icon: CheckCircle2, accent: "bg-indigo-50 text-indigo-600", changes: { status: "COMPLETED" }, active: params.status === "COMPLETED" },
    { label: "Total de matrículas", value: summary.total, icon: ClipboardList, accent: "bg-paper-muted text-ash-700", changes: {}, active: !filtersActive },
  ];

  const columns: DataColumn<Row>[] = [
    {
      key: "student",
      header: "Alumno",
      sortKey: "student",
      firstDir: "asc",
      cell: (e) => (
        <>
          <p className="font-medium text-ink-900">{e.userName}</p>
          <p className="text-xs text-ash-500">{e.userEmail}</p>
        </>
      ),
    },
    {
      key: "offering",
      header: "Curso o programa",
      cell: (e) => (
        <>
          {localize(e.offeringTitle, locale)}
          <p className="text-xs text-ash-500">
            {e.offeringKind === "COURSE" ? "Curso" : "Programa"} · {ENROLLMENT_SOURCE_LABEL[e.source] ?? e.source}
          </p>
        </>
      ),
    },
    { key: "progress", header: "Avance", sortKey: "progress", firstDir: "desc", align: "right", cell: (e) => `${Math.round(e.progressPct)}%` },
    {
      key: "status",
      header: "Estado",
      sortKey: "status",
      cell: (e) => <Badge variant={ENROLLMENT_STATUS_VARIANT[e.status] ?? "neutral"}>{ENROLLMENT_STATUS_LABEL[e.status] ?? e.status}</Badge>,
    },
    { key: "enrolled", header: "Matriculado", sortKey: "enrolled", firstDir: "desc", cell: (e) => formatDate(e.enrolledAt, locale) },
    {
      key: "expires",
      header: "Acceso vence",
      sortKey: "expires",
      firstDir: "asc",
      cell: (e) => (e.accessExpiresAt ? formatDate(e.accessExpiresAt, locale) : "Abierto (sin vencimiento)"),
    },
    { key: "extend", header: "Ampliar", cell: (e) => <ExtendAccessControl enrollmentId={e.id} accessExpiresAt={e.accessExpiresAt} /> },
    { key: "reset", header: "Avance (caso extremo)", cell: (e) => (e.offeringKind === "COURSE" ? <ResetProgressControl enrollmentId={e.id} /> : null) },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink-900">Matrículas</h1>
          <p className="mt-1 max-w-3xl text-sm text-ash-500">
            Todas las matrículas. Los <b>casos extemporáneos</b> (plazo vencido y curso sin terminar) están a un clic. Busca a un alumno para ampliar su acceso o, en
            casos extremos, resetear su avance a 0 % o forzarlo a 100 % — ambas acciones quedan registradas en la auditoría.
          </p>
        </div>
        <ExportButtons path="enrollments/export" params={params} />
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

      <FilterBar basePath={BASE} params={params} filterKeys={FILTER_KEYS}>
        <FilterField label="Alumno (nombre o correo)" htmlFor="f-q">
          <Input id="f-q" name="q" defaultValue={params.q ?? ""} placeholder="Ej.: juan perez o juan@correo.com" className="w-72" />
        </FilterField>
        <FilterField label="Estado" htmlFor="f-status">
          <Select id="f-status" name="status" defaultValue={params.status ?? ""} className="w-40">
            <option value="">Todos</option>
            {Object.entries(ENROLLMENT_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Tipo" htmlFor="f-kind">
          <Select id="f-kind" name="kind" defaultValue={params.kind ?? ""} className="w-36">
            <option value="">Todos</option>
            <option value="COURSE">Curso</option>
            <option value="PROGRAM">Programa</option>
          </Select>
        </FilterField>
        <FilterField label="Casos extemporáneos" htmlFor="f-expired">
          <Select id="f-expired" name="expired" defaultValue={params.expired ?? ""} className="w-44">
            <option value="">Todas las matrículas</option>
            <option value="1">Solo vencidas sin terminar</option>
          </Select>
        </FilterField>
        <FilterField label="Matriculado desde" htmlFor="f-from">
          <Input id="f-from" type="date" name="from" defaultValue={params.from ?? ""} className="w-40" />
        </FilterField>
        <FilterField label="Matriculado hasta" htmlFor="f-to">
          <Input id="f-to" type="date" name="to" defaultValue={params.to ?? ""} className="w-40" />
        </FilterField>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={result.rows}
        rowKey={(e) => e.id}
        basePath={BASE}
        params={params}
        sort={result.sort}
        dir={result.dir}
        caption="Matrículas de alumnos"
        empty={
          result.total > 0 ? (
            <EmptyState
              title="Esta página no tiene resultados"
              description={`Hay ${pages} ${pages === 1 ? "página" : "páginas"} de resultados.`}
              action={<Link href={listHref(BASE, params, { page: undefined })} className="text-sm font-medium text-indigo-600 hover:underline">Ir a la primera página</Link>}
            />
          ) : filtersActive ? (
            <EmptyState
              title="No hay matrículas con estos filtros"
              description={params.expired === "1" && Object.keys(params).filter((k) => FILTER_KEYS.includes(k)).length === 1 ? "No hay casos extemporáneos: todos los alumnos con plazo vencido ya terminaron su curso." : "Prueba con otro nombre, estado o rango de fechas."}
              action={<Link href={BASE} className="text-sm font-medium text-indigo-600 hover:underline">Limpiar filtros</Link>}
            />
          ) : (
            <EmptyState title="Todavía no hay matrículas" description="Cuando un alumno compre o reciba acceso a un curso, aparecerá aquí." />
          )
        }
      />

      <Pagination basePath={BASE} params={params} page={result.page} pageSize={result.pageSize} total={result.total} />
    </div>
  );
}

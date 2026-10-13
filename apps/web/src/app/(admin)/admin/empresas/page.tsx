import type { Metadata } from "next";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { adminApi, type AdminCompaniesPage } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { flattenParams, listHref, type RawSearchParams } from "@/lib/list-state";
import { COMPANY_SIZE_LABEL, COMPANY_STATUS_LABEL } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import { getLocale } from "next-intl/server";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Input";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { ExportButtons } from "@/components/data/ExportButtons";
import { FilterBar, FilterField } from "@/components/data/FilterBar";
import { Pagination } from "@/components/data/Pagination";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Empresas (admin)" };

const BASE = "/admin/empresas";
const FILTER_KEYS = ["q", "status", "size", "country", "from", "to"];
const EMPTY: AdminCompaniesPage = { rows: [], total: 0, page: 1, pageSize: 25, sort: "name", dir: "asc" };

type Row = AdminCompaniesPage["rows"][number];

export default async function AdminCompaniesPage({ searchParams }: { searchParams: RawSearchParams }) {
  const locale = await getLocale();
  const accessToken = getServerAccessToken();
  const params = flattenParams(searchParams);

  const [{ data: result }, { data: summary }] = await Promise.all([
    withFallback(() => adminApi.companiesSearch(params, accessToken), EMPTY),
    withFallback(() => adminApi.companiesSummary(accessToken), { total: 0, active: 0, suspended: 0 }),
  ]);

  const filtersActive = FILTER_KEYS.some((k) => params[k]);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));

  const cards = [
    { label: "Total de empresas", value: summary.total, accent: "bg-indigo-50 text-indigo-600", changes: {}, active: !filtersActive },
    { label: "Activas", value: summary.active, accent: "bg-success-bg text-success", changes: { status: "active" }, active: params.status === "active" },
    { label: "Suspendidas", value: summary.suspended, accent: "bg-danger-bg text-danger", changes: { status: "suspended" }, active: params.status === "suspended" },
  ];

  const columns: DataColumn<Row>[] = [
    {
      key: "name",
      header: "Razón social",
      sortKey: "name",
      firstDir: "asc",
      cell: (c) => (
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
            <Building2 className="h-4 w-4" aria-hidden="true" />
          </span>
          <span>
            <span className="font-medium text-ink-900">{c.legalName}</span>
            <span className="block text-xs text-ash-500">{c.taxIdType} {c.taxId}</span>
          </span>
        </div>
      ),
    },
    { key: "country", header: "País", sortKey: "country", firstDir: "asc", cell: (c) => c.country },
    { key: "size", header: "Tamaño", sortKey: "size", firstDir: "asc", cell: (c) => (c.size ? <Badge variant="outline">{COMPANY_SIZE_LABEL[c.size] ?? c.size}</Badge> : "—") },
    { key: "members", header: "Colaboradores", align: "right", cell: (c) => c.members.toLocaleString("es-PE") },
    {
      key: "seats",
      header: "Cupos",
      cell: (c) => {
        const pct = c.seatsPurchased > 0 ? Math.min(100, Math.round((c.seatsUsed / c.seatsPurchased) * 100)) : 0;
        return (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-paper-muted" aria-hidden="true">
              <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="whitespace-nowrap text-xs text-ash-500">{c.seatsUsed}/{c.seatsPurchased} usados</span>
          </div>
        );
      },
    },
    { key: "status", header: "Estado", sortKey: "status", firstDir: "asc", cell: (c) => <Badge variant={c.status === "active" ? "success" : "danger"}>{COMPANY_STATUS_LABEL[c.status] ?? c.status}</Badge> },
    { key: "created", header: "Registrada", sortKey: "created", firstDir: "desc", cell: (c) => formatDate(c.createdAt, locale) },
    {
      key: "actions",
      header: "Acciones",
      cell: (c) => (
        <Link href={`/empresa/${c.id}`}>
          <Button size="sm" variant="outline">Gestionar</Button>
        </Link>
      ),
    },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink-900">Empresas</h1>
          <p className="mt-1 max-w-3xl text-sm text-ash-500">
            Entra a «Gestionar» para ver a los trabajadores de cada empresa, qué cursos llevan, asignarles cupos (si la empresa todavía no lo hizo ella misma) y ver sus
            reportes de avance — el mismo panel que usa la empresa, con acceso completo.
          </p>
        </div>
        <ExportButtons path="companies/export" params={params} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
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
                  <Building2 className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="mt-3 font-serif text-2xl font-semibold text-ink-900">{c.value.toLocaleString("es-PE")}</p>
                <p className="text-sm text-ash-500">{c.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <FilterBar basePath={BASE} params={params} filterKeys={FILTER_KEYS}>
        <FilterField label="Buscar (razón social o RUC)" htmlFor="f-q">
          <Input id="f-q" name="q" defaultValue={params.q ?? ""} placeholder="Ej.: minera sur o 20123456789" className="w-72" />
        </FilterField>
        <FilterField label="Estado" htmlFor="f-status">
          <Select id="f-status" name="status" defaultValue={params.status ?? ""} className="w-36">
            <option value="">Todos</option>
            <option value="active">Activa</option>
            <option value="suspended">Suspendida</option>
          </Select>
        </FilterField>
        <FilterField label="Tamaño" htmlFor="f-size">
          <Select id="f-size" name="size" defaultValue={params.size ?? ""} className="w-40">
            <option value="">Todos</option>
            {Object.entries(COMPANY_SIZE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="País (código)" htmlFor="f-country">
          <Input id="f-country" name="country" defaultValue={params.country ?? ""} placeholder="PE" maxLength={2} className="w-24 uppercase" />
        </FilterField>
        <FilterField label="Registrada desde" htmlFor="f-from">
          <Input id="f-from" type="date" name="from" defaultValue={params.from ?? ""} className="w-40" />
        </FilterField>
        <FilterField label="Registrada hasta" htmlFor="f-to">
          <Input id="f-to" type="date" name="to" defaultValue={params.to ?? ""} className="w-40" />
        </FilterField>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={result.rows}
        rowKey={(c) => c.id}
        basePath={BASE}
        params={params}
        sort={result.sort}
        dir={result.dir}
        caption="Empresas clientes"
        empty={
          result.total > 0 ? (
            <EmptyState
              title="Esta página no tiene resultados"
              description={`Hay ${pages} ${pages === 1 ? "página" : "páginas"} de resultados.`}
              action={<Link href={listHref(BASE, params, { page: undefined })} className="text-sm font-medium text-indigo-600 hover:underline">Ir a la primera página</Link>}
            />
          ) : filtersActive ? (
            <EmptyState
              title="No hay empresas con estos filtros"
              description="Prueba con otra razón social, RUC, estado o país."
              action={<Link href={BASE} className="text-sm font-medium text-indigo-600 hover:underline">Limpiar filtros</Link>}
            />
          ) : (
            <EmptyState title="Todavía no hay empresas" description="Las empresas se crean cuando una cotización B2B se convierte en cupos o cuando una persona registra la suya." />
          )
        }
      />

      <Pagination basePath={BASE} params={params} page={result.page} pageSize={result.pageSize} total={result.total} />
    </div>
  );
}

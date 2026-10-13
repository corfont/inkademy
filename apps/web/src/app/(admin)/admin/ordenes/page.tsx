import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, CheckCircle2, Clock, XCircle } from "lucide-react";
import { adminApi, type AdminOrdersPage } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { flattenParams, listHref, type RawSearchParams } from "@/lib/list-state";
import { INVOICE_STATUS_LABEL, ORDER_STATUS_LABEL, ORDER_STATUS_VARIANT } from "@/lib/labels";
import { formatDate, formatPrice, localize } from "@/lib/format";
import { getLocale } from "next-intl/server";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Input";
import { DataTable, type DataColumn } from "@/components/data/DataTable";
import { ExportButtons } from "@/components/data/ExportButtons";
import { FilterBar, FilterField } from "@/components/data/FilterBar";
import { Pagination } from "@/components/data/Pagination";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Órdenes (admin)" };

const BASE = "/admin/ordenes";
const FILTER_KEYS = ["q", "status", "currency", "from", "to"];
const EMPTY: AdminOrdersPage = { rows: [], total: 0, page: 1, pageSize: 25, sort: "date", dir: "desc", paidByCurrency: [] };

type Row = AdminOrdersPage["rows"][number];

export default async function AdminOrdersPage({ searchParams }: { searchParams: RawSearchParams }) {
  const locale = await getLocale();
  const accessToken = getServerAccessToken();
  const params = flattenParams(searchParams);

  const [{ data: result }, { data: summary }] = await Promise.all([
    withFallback(() => adminApi.orders(params, accessToken), EMPTY),
    withFallback(() => adminApi.ordersSummary(accessToken), { total: 0, paid: 0, pending: 0, failed: 0, paidTotalPen: "0" }),
  ]);

  const filtersActive = FILTER_KEYS.some((k) => params[k]);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));

  // Tarjetas clicables (estándar de producto): cada una aplica el filtro de estado correspondiente.
  const cards = [
    { label: "Total de órdenes", value: summary.total, icon: ClipboardList, accent: "bg-indigo-50 text-indigo-600", status: undefined },
    { label: "Pagadas", value: summary.paid, icon: CheckCircle2, accent: "bg-success-bg text-success", status: "PAID" },
    { label: "Pendientes", value: summary.pending, icon: Clock, accent: "bg-gold-100 text-gold-700", status: "PENDING" },
    { label: "Fallidas", value: summary.failed, icon: XCircle, accent: "bg-danger-bg text-danger", status: "FAILED" },
  ];

  const columns: DataColumn<Row>[] = [
    {
      key: "buyer",
      header: "Comprador",
      sortKey: "buyer",
      cell: (o) => (
        <>
          <Link href={`/admin/ordenes/${o.id}`} className="font-medium text-ink-900 hover:underline">
            {o.buyerLegalName ?? o.userEmail}
          </Link>
          <p className="text-xs text-ash-500">{o.userEmail}</p>
        </>
      ),
    },
    { key: "company", header: "Empresa", sortKey: "company", cell: (o) => o.companyName ?? "—" },
    { key: "course", header: "Curso", cell: (o) => (o.courseTitle ? localize(o.courseTitle, locale) : "—") },
    { key: "category", header: "Categoría", cell: (o) => (o.categoryName ? localize(o.categoryName, locale) : "—") },
    { key: "date", header: "Fecha", sortKey: "date", firstDir: "desc", cell: (o) => formatDate(o.createdAt, locale) },
    { key: "total", header: "Total", sortKey: "total", firstDir: "desc", align: "right", cell: (o) => formatPrice(o.total, o.currency, locale) },
    {
      key: "status",
      header: "Estado",
      sortKey: "status",
      cell: (o) => <Badge variant={ORDER_STATUS_VARIANT[o.status] ?? "neutral"}>{ORDER_STATUS_LABEL[o.status] ?? o.status}</Badge>,
    },
    { key: "invoice", header: "Comprobante", cell: (o) => (o.invoiceStatus ? INVOICE_STATUS_LABEL[o.invoiceStatus] ?? o.invoiceStatus : "—") },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Órdenes</h1>
        <ExportButtons path="orders/export" params={params} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const active = (params.status ?? undefined) === c.status && FILTER_KEYS.filter((k) => k !== "status").every((k) => !params[k]);
          return (
            <Link
              key={c.label}
              href={listHref(BASE, {}, { status: c.status })}
              aria-label={`${c.label}: ${c.value}. Ver el detalle`}
              aria-current={active ? "true" : undefined}
              className="rounded-lg focus-visible:outline-2 focus-visible:outline-ink-500"
            >
              <Card className={cn("h-full transition-shadow hover:shadow-raised", active && "ring-2 ring-ink-900")}>
                <CardContent className="p-5">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-full ${c.accent}`}>
                    <c.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <p className="mt-3 font-serif text-2xl font-semibold text-ink-900">{c.value}</p>
                  <p className="text-sm text-ash-500">{c.label}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
      <p className="-mt-2 text-xs text-ash-500">Total pagado en soles (PEN), todas las órdenes: {formatPrice(summary.paidTotalPen, "PEN", locale)}</p>

      <FilterBar basePath={BASE} params={params} filterKeys={FILTER_KEYS}>
        <FilterField label="Buscar" htmlFor="f-q">
          <Input id="f-q" name="q" defaultValue={params.q ?? ""} placeholder="Id de orden, correo, comprador o empresa" className="w-72" />
        </FilterField>
        <FilterField label="Estado" htmlFor="f-status">
          <Select id="f-status" name="status" defaultValue={params.status ?? ""} className="w-40">
            <option value="">Todos</option>
            {Object.entries(ORDER_STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Moneda" htmlFor="f-currency">
          <Select id="f-currency" name="currency" defaultValue={params.currency ?? ""} className="w-32">
            <option value="">Todas</option>
            <option value="PEN">Soles (PEN)</option>
            <option value="USD">Dólares (USD)</option>
          </Select>
        </FilterField>
        <FilterField label="Desde" htmlFor="f-from">
          <Input id="f-from" type="date" name="from" defaultValue={params.from ?? ""} className="w-40" />
        </FilterField>
        <FilterField label="Hasta" htmlFor="f-to">
          <Input id="f-to" type="date" name="to" defaultValue={params.to ?? ""} className="w-40" />
        </FilterField>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={result.rows}
        rowKey={(o) => o.id}
        basePath={BASE}
        params={params}
        sort={result.sort}
        dir={result.dir}
        caption="Órdenes de compra"
        empty={
          result.total > 0 ? (
            <EmptyState
              title="Esta página no tiene resultados"
              description={`Hay ${pages} ${pages === 1 ? "página" : "páginas"} de resultados.`}
              action={<Link href={listHref(BASE, params, { page: undefined })} className="text-sm font-medium text-indigo-600 hover:underline">Ir a la primera página</Link>}
            />
          ) : filtersActive ? (
            <EmptyState
              title="No hay órdenes con estos filtros"
              description="Prueba con otro rango de fechas o quita algún filtro."
              action={<Link href={BASE} className="text-sm font-medium text-indigo-600 hover:underline">Limpiar filtros</Link>}
            />
          ) : (
            <EmptyState title="Todavía no hay órdenes" description="Cuando alguien compre un curso o programa, aparecerá aquí." />
          )
        }
        footer={
          result.paidByCurrency.length > 0 ? (
            <tr>
              <td colSpan={5} className="p-4 text-right text-sm font-medium">Total pagado en este filtro ({result.total.toLocaleString("es-PE")} órdenes)</td>
              <td className="p-4 text-right text-sm font-semibold tabular-nums">
                {result.paidByCurrency.map((p) => (
                  <div key={p.currency}>{formatPrice(p.total, p.currency, locale)}</div>
                ))}
              </td>
              <td colSpan={2} />
            </tr>
          ) : undefined
        }
      />

      <Pagination basePath={BASE} params={params} page={result.page} pageSize={result.pageSize} total={result.total} />
    </div>
  );
}

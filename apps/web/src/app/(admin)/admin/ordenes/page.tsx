import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, CheckCircle2, Clock, XCircle } from "lucide-react";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { formatDate, formatPrice, localize } from "@/lib/format";
import { getLocale } from "next-intl/server";

export const metadata: Metadata = { title: "Órdenes (admin)" };

type OrderRow = {
  id: string;
  status: string;
  total: string;
  currency: string;
  userEmail: string;
  buyerLegalName: string | null;
  companyName: string | null;
  courseTitle: Record<string, string> | null;
  categoryName: Record<string, string> | null;
  invoiceStatus: string | null;
  createdAt: string;
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  PAID: "success",
  PENDING: "warning",
  FAILED: "danger",
  REFUNDED: "neutral",
  CANCELLED: "neutral",
};

const SORT_LABEL: Record<string, string> = {
  date: "Fecha",
  company: "Empresa",
  course: "Curso",
  status: "Estado",
  category: "Categoría del curso",
};

export default async function AdminOrdersPage({ searchParams }: { searchParams: { q?: string; sortBy?: string } }) {
  const locale = await getLocale();
  const accessToken = getServerAccessToken();
  const q = searchParams.q?.trim() || undefined;
  const sortBy = searchParams.sortBy || "date";
  const [{ data: orders, live }, { data: summary }] = await Promise.all([
    withFallback(() => adminApi.orders(q, accessToken, sortBy), [] as OrderRow[]),
    withFallback(() => adminApi.ordersSummary(accessToken), { total: 0, paid: 0, pending: 0, failed: 0, paidTotalPen: "0" }),
  ]);

  const summaryCards = [
    { label: "Total de órdenes", value: summary.total, icon: ClipboardList, accent: "bg-indigo-50 text-indigo-600" },
    { label: "Pagadas", value: summary.paid, icon: CheckCircle2, accent: "bg-success-bg text-success" },
    { label: "Pendientes", value: summary.pending, icon: Clock, accent: "bg-gold-100 text-gold-700" },
    { label: "Fallidas", value: summary.failed, icon: XCircle, accent: "bg-danger-bg text-danger" },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">Órdenes</h1>
      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((c) => (
          <Card key={c.label} className="transition-shadow hover:shadow-raised">
            <CardContent className="p-5">
              <span className={`flex h-10 w-10 items-center justify-center rounded-full ${c.accent}`}>
                <c.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <p className="mt-3 font-serif text-2xl font-semibold text-ink-900">{c.value}</p>
              <p className="text-sm text-ash-500">{c.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="-mt-2 text-xs text-ash-500">Total pagado en soles (PEN): {formatPrice(summary.paidTotalPen, "PEN", locale)}</p>

      <form className="flex flex-wrap items-end gap-2" action="/admin/ordenes">
        <Input name="q" defaultValue={q ?? ""} placeholder="Buscar por id de orden, email o razón social…" className="max-w-md" />
        <div>
          <label className="mb-1 block text-xs font-medium text-ash-600">Ordenar por</label>
          <Select name="sortBy" defaultValue={sortBy} className="w-44">
            {Object.entries(SORT_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="outline">
          Aplicar
        </Button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-paper-border bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-paper-border text-ash-500">
            <tr>
              <th className="p-4 font-medium">Comprador</th>
              <th className="p-4 font-medium">Empresa</th>
              <th className="p-4 font-medium">Curso</th>
              <th className="p-4 font-medium">Categoría</th>
              <th className="p-4 font-medium">Fecha</th>
              <th className="p-4 font-medium">Total</th>
              <th className="p-4 font-medium">Estado</th>
              <th className="p-4 font-medium">Comprobante</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-ash-500">
                  No se encontraron órdenes.
                </td>
              </tr>
            )}
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-paper-border last:border-0 hover:bg-paper-muted">
                <td className="p-4">
                  <Link href={`/admin/ordenes/${o.id}`} className="font-medium text-ink-900 hover:underline">
                    {o.buyerLegalName ?? o.userEmail}
                  </Link>
                  <p className="text-xs text-ash-500">{o.userEmail}</p>
                </td>
                <td className="p-4 text-ash-600">{o.companyName ?? "—"}</td>
                <td className="p-4 text-ash-600">{o.courseTitle ? localize(o.courseTitle, locale) : "—"}</td>
                <td className="p-4 text-ash-600">{o.categoryName ? localize(o.categoryName, locale) : "—"}</td>
                <td className="p-4 text-ash-600">{formatDate(o.createdAt, locale)}</td>
                <td className="p-4 text-ash-600">{formatPrice(o.total, o.currency, locale)}</td>
                <td className="p-4">
                  <Badge variant={STATUS_VARIANT[o.status] ?? "neutral"}>{o.status}</Badge>
                </td>
                <td className="p-4 text-ash-600">{o.invoiceStatus ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

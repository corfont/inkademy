import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getTranslations, getLocale } from "next-intl/server";
import { meApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { formatDate, formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Pagos" };

interface OrderLike {
  id: string;
  createdAt: string;
  total: string;
  currency: string;
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "CANCELLED";
  description: string;
  receiptUrl?: string | null;
}

const MOCK_ORDERS: OrderLike[] = [
  { id: "ord-4821", createdAt: "2026-06-01T00:00:00.000Z", total: "459.00", currency: "PEN", status: "PAID", description: "Liderazgo de equipos remotos", receiptUrl: "#" },
  { id: "ord-4790", createdAt: "2026-04-15T00:00:00.000Z", total: "999.00", currency: "PEN", status: "PAID", description: "Diplomado en Gestión Financiera para Líderes", receiptUrl: "#" },
];

const STATUS_VARIANT: Record<OrderLike["status"], "success" | "warning" | "danger" | "neutral"> = {
  PAID: "success",
  PENDING: "warning",
  FAILED: "danger",
  REFUNDED: "neutral",
  CANCELLED: "neutral",
};

export default async function PaymentsPage() {
  const t = await getTranslations("campus.payments");
  const locale = await getLocale();
  const accessToken = cookies().get(ACCESS_TOKEN_COOKIE)?.value ?? null;

  const { data: orders, live } = await withFallback(() => meApi.orders(accessToken), MOCK_ORDERS);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">{t("title")}</h1>
      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      {orders.length === 0 ? (
        <p className="text-ash-500">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-paper-border bg-paper">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-paper-border text-ash-500">
              <tr>
                <th className="p-4 font-medium">{t("order")}</th>
                <th className="p-4 font-medium">{t("date")}</th>
                <th className="p-4 font-medium">{t("amount")}</th>
                <th className="p-4 font-medium">{t("status")}</th>
                <th className="p-4 font-medium">{t("receipt")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-border">
              {orders.map((order: OrderLike) => (
                <tr key={order.id}>
                  <td className="p-4">
                    <p className="font-medium text-ink-900">{order.id}</p>
                    <p className="text-ash-500">{order.description}</p>
                  </td>
                  <td className="p-4 text-ash-600">{formatDate(order.createdAt, locale)}</td>
                  <td className="p-4 text-ash-600">{formatPrice(order.total, order.currency, locale)}</td>
                  <td className="p-4">
                    <Badge variant={STATUS_VARIANT[order.status]}>{order.status}</Badge>
                  </td>
                  <td className="p-4">
                    {order.receiptUrl ? (
                      <a href={order.receiptUrl} className="text-ink-700 hover:underline">
                        Ver
                      </a>
                    ) : (
                      "—"
                    )}
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

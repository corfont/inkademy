import type { Metadata } from "next";
import Link from "next/link";
import { commerceApi } from "@/lib/api-client";
import { getServerAccessToken } from "@/lib/server-auth";
import { CancelOrderButton } from "@/components/admin/CancelOrderButton";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { formatDate, formatPrice } from "@/lib/format";
import { getLocale } from "next-intl/server";

export const metadata: Metadata = { title: "Detalle de orden (admin)" };

export default async function AdminOrderDetailPage({ params }: { params: { id: string } }) {
  const locale = await getLocale();
  const accessToken = getServerAccessToken();
  const order = await commerceApi.order(params.id, accessToken ?? undefined);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Orden {order.id}</h1>
        <Link href="/admin/ordenes" className="text-sm text-ink-600 hover:underline">
          ← Volver a órdenes
        </Link>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm text-ash-500">Estado</span>
            <Badge variant={order.status === "PAID" ? "success" : order.status === "REFUNDED" ? "neutral" : "danger"}>
              {order.status}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-ash-500">Total</span>
            <span className="font-medium text-ink-900">{formatPrice(order.total, order.currency, locale)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-ash-500">Fecha</span>
            <span>{formatDate(order.createdAt, locale)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Comprobante electrónico</h2>
          {order.electronicInvoice ? (
            <div className="flex flex-col gap-1 text-sm">
              <p>
                {order.electronicInvoice.documentType} {order.electronicInvoice.series}-{order.electronicInvoice.correlativo}
              </p>
              <p className="text-ash-500">Estado SUNAT: {order.electronicInvoice.status}</p>
              {order.electronicInvoice.sunatDescription && <p className="text-ash-500">{order.electronicInvoice.sunatDescription}</p>}
            </div>
          ) : (
            <p className="text-sm text-ash-500">Sin comprobante (curso gratuito o pendiente de procesar).</p>
          )}

          {order.electronicNotes?.length > 0 && (
            <div className="mt-2 flex flex-col gap-2 border-t border-paper-border pt-3">
              <h3 className="text-sm font-medium text-ink-900">Notas emitidas</h3>
              {order.electronicNotes.map((n: any, i: number) => (
                <div key={i} className="text-sm text-ash-600">
                  {n.noteType === "CREDIT" ? "Nota de crédito" : "Nota de débito"} {n.series}-{n.correlativo} — {n.status}
                  <span className="block text-xs text-ash-500">{n.reasonDescription}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {order.status === "PAID" && order.electronicInvoice && (
        <Card>
          <CardContent className="p-6">
            <CancelOrderButton orderId={order.id} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

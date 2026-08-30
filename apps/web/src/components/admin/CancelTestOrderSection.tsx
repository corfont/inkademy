"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Callout } from "@/components/ui/Callout";
import { Dialog } from "@/components/ui/Dialog";
import { commerceApi } from "@/lib/api-client";

/**
 * "Retrotraer... una orden/compra (deshacer un pago de prueba)" — distinto
 * de Cancelar/Reembolsar (que sí llama a la pasarela real y emite nota de
 * crédito SUNAT): solo sirve para una orden que todavía no emitió
 * comprobante electrónico. Ver CommerceService.cancelTestOrder.
 */
export function CancelTestOrderSection() {
  const [orderId, setOrderId] = useState("");
  const [order, setOrder] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelledInfo, setCancelledInfo] = useState<{ cancelledEnrollmentIds: string[] } | null>(null);

  const requiredPhrase = "CANCELAR ORDEN DE PRUEBA";

  async function handleSearch() {
    if (!orderId.trim()) return;
    setSearching(true);
    setSearchError(null);
    setOrder(null);
    setCancelledInfo(null);
    try {
      const found = await commerceApi.order(orderId.trim());
      setOrder(found);
    } catch {
      setSearchError("No se encontró esa orden");
    } finally {
      setSearching(false);
    }
  }

  async function handleCancel() {
    setSubmitting(true);
    setCancelError(null);
    try {
      const res = await commerceApi.cancelTestOrder(order.id);
      setOrder({ ...order, status: res.status });
      setCancelledInfo({ cancelledEnrollmentIds: res.cancelledEnrollmentIds });
      setDialogOpen(false);
      setConfirmText("");
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "No se pudo cancelar la orden");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cancelar orden de prueba</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="order-id">ID de la orden</Label>
          <div className="flex gap-2">
            <Input
              id="order-id"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="uuid de la orden"
            />
            <Button variant="outline" onClick={handleSearch} disabled={searching || !orderId.trim()}>
              {searching ? "Buscando…" : "Buscar"}
            </Button>
          </div>
          {searchError && <p className="mt-1 text-sm text-danger">{searchError}</p>}
        </div>

        {order && (
          <div className="space-y-3 rounded-md border border-paper-border p-4 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <p><span className="text-ash-500">Estado:</span> {order.status}</p>
              <p><span className="text-ash-500">Total:</span> {order.total} {order.currency}</p>
              <p><span className="text-ash-500">Ítems:</span> {order.items?.length ?? 0}</p>
              <p><span className="text-ash-500">Comprobante SUNAT:</span> {order.electronicInvoice ? `${order.electronicInvoice.documentType} (${order.electronicInvoice.status})` : "Ninguno"}</p>
            </div>

            {cancelledInfo && (
              <Callout variant="success">
                Orden cancelada. Matrículas revertidas: {cancelledInfo.cancelledEnrollmentIds.length}
              </Callout>
            )}
            {cancelError && <Callout variant="danger">{cancelError}</Callout>}

            {order.status !== "CANCELLED" && order.status !== "REFUNDED" && (
              <Button variant="danger" onClick={() => setDialogOpen(true)}>
                Cancelar orden de prueba
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onClose={() => !submitting && setDialogOpen(false)} title="Cancelar orden de prueba">
        <div className="space-y-4">
          <Callout variant="danger" title="Esta acción no se puede deshacer">
            Se cancelará la orden y la(s) matrícula(s) que generó. Se rechaza si ya emitió comprobante SUNAT o certificado.
          </Callout>
          <p className="text-sm text-ash-700">
            Para confirmar, escribe exactamente: <span className="font-mono font-semibold text-ink-900">{requiredPhrase}</span>
          </p>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={requiredPhrase} autoFocus />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button variant="danger" disabled={confirmText !== requiredPhrase || submitting} onClick={handleCancel}>
              {submitting ? "Procesando…" : "Confirmar"}
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}

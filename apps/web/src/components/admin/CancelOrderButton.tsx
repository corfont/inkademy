"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { commerceApi, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";

/**
 * POST /orders/:id/cancel (ADMIN/SUPPORT) reembolsa el cobro original y
 * emite la nota de crédito SUNAT correspondiente — antes de esto no existía
 * ninguna forma de disparar ese endpoint desde la interfaz.
 */
export function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (reason.trim().length < 3) {
      setError("Indica el motivo de la anulación (mínimo 3 caracteres).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await commerceApi.cancelOrder(orderId, reason.trim());
      router.refresh();
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos cancelar la orden.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-bg" onClick={() => setOpen(true)}>
        Cancelar orden y emitir nota de crédito
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-danger/30 bg-danger-bg/40 p-4">
      <p className="text-sm font-medium text-ink-900">
        Esto reembolsará el cobro original y emitirá una nota de crédito SUNAT. No se puede deshacer.
      </p>
      <textarea
        className="min-h-[4rem] rounded-md border border-paper-border bg-paper p-2 text-sm"
        placeholder="Motivo (ej. el alumno desistió de la compra)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {error && <Callout variant="danger">{error}</Callout>}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Volver
        </Button>
        <Button size="sm" variant="danger" onClick={handleConfirm} disabled={busy}>
          {busy ? "Procesando…" : "Confirmar cancelación"}
        </Button>
      </div>
    </div>
  );
}

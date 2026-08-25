"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { companyApi, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

/**
 * Antes "comprar más cupos" (BuyMoreSeatsButton) solo sumaba seatsPurchased
 * sin nunca tocar expiresAt — un pool ya vencido seguía vencido aunque se
 * le compraran más cupos. Esto extiende la fecha de vencimiento
 * directamente (sin pasar por checkout/pago — es una decisión comercial,
 * no una compra en línea).
 */
export function RenewSeatPoolButton({ companyId, poolId }: { companyId: string; poolId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [months, setMonths] = useState(12);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Renovar
      </Button>
    );
  }

  async function handleRenew() {
    setBusy(true);
    setError(null);
    try {
      await companyApi.renewSeatPool(companyId, poolId, months);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos renovar el cupo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <Input type="number" min={1} max={60} value={months} onChange={(e) => setMonths(Number(e.target.value))} className="h-9 w-16" />
        <span className="text-xs text-ash-500">meses</span>
        <Button size="sm" disabled={busy} onClick={handleRenew}>
          {busy ? "Renovando…" : "Confirmar"}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

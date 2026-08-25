"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, ApiError } from "@/lib/api-client";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";

/**
 * El % de comisión de Culqi/Stripe depende del contrato comercial real de
 * Inkademy (varía por volumen) — se deja configurable acá en vez de un
 * valor fijo en código, así el "Saldo total" refleja la comisión real.
 */
export function FeeSettingsForm({ culqiFeePercent, stripeFeePercent }: { culqiFeePercent: number; stripeFeePercent: number }) {
  const router = useRouter();
  const [culqi, setCulqi] = useState(String(culqiFeePercent));
  const [stripe, setStripe] = useState(String(stripeFeePercent));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await adminApi.updateFeeSettings({ culqiFeePercent: Number(culqi), stripeFeePercent: Number(stripe) });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar la comisión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <Label htmlFor="culqi-fee">Comisión Culqi (%)</Label>
        <Input id="culqi-fee" type="number" min="0" max="100" step="0.01" value={culqi} onChange={(e) => setCulqi(e.target.value)} className="w-28" />
      </div>
      <div>
        <Label htmlFor="stripe-fee">Comisión Stripe (%)</Label>
        <Input id="stripe-fee" type="number" min="0" max="100" step="0.01" value={stripe} onChange={(e) => setStripe(e.target.value)} className="w-28" />
      </div>
      <Button size="sm" variant="outline" disabled={busy} onClick={handleSave}>
        {busy ? "…" : saved ? "Guardado ✓" : "Guardar"}
      </Button>
      {error && <Callout variant="danger">{error}</Callout>}
    </div>
  );
}

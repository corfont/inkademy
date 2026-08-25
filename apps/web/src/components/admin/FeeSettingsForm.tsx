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
 *
 * "Ahí aparecen dos tipos de comisiones de Culqi, debería de haber una
 * leyenda que explique qué es cada uno de ellos" — el reporte confundía
 * las DOS pasarelas (Culqi para soles/nacional, Stripe para
 * dólares/internacional) con "dos comisiones de Culqi". La leyenda de
 * abajo lo deja explícito.
 */
export function FeeSettingsForm({
  culqiFeePercent,
  stripeFeePercent,
  detractionEnabled,
  detractionPercent,
}: {
  culqiFeePercent: number;
  stripeFeePercent: number;
  detractionEnabled: boolean;
  detractionPercent: number;
}) {
  const router = useRouter();
  const [culqi, setCulqi] = useState(String(culqiFeePercent));
  const [stripe, setStripe] = useState(String(stripeFeePercent));
  const [detractOn, setDetractOn] = useState(detractionEnabled);
  const [detractPct, setDetractPct] = useState(String(detractionPercent));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await adminApi.updateFeeSettings({
        culqiFeePercent: Number(culqi),
        stripeFeePercent: Number(stripe),
        detractionEnabled: detractOn,
        detractionPercent: Number(detractPct),
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar la configuración.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md bg-paper-muted p-3 text-xs text-ash-600">
        <p>
          <span className="font-semibold text-ink-800">Comisión Culqi</span>: se aplica a ventas en <strong>soles (PEN)</strong> — tarjeta, Yape,
          Plin, rieles nacionales.
        </p>
        <p className="mt-1">
          <span className="font-semibold text-ink-800">Comisión Stripe</span>: se aplica a ventas en <strong>dólares (USD)</strong> — compradores
          internacionales.
        </p>
        <p className="mt-1">No son dos comisiones del mismo proveedor — cada una corresponde a una pasarela distinta según la moneda del curso.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="culqi-fee">Comisión Culqi (%) — ventas en soles</Label>
          <Input id="culqi-fee" type="number" min="0" max="100" step="0.01" value={culqi} onChange={(e) => setCulqi(e.target.value)} className="w-28" />
        </div>
        <div>
          <Label htmlFor="stripe-fee">Comisión Stripe (%) — ventas en dólares</Label>
          <Input id="stripe-fee" type="number" min="0" max="100" step="0.01" value={stripe} onChange={(e) => setStripe(e.target.value)} className="w-28" />
        </div>
      </div>

      <div className="rounded-md bg-paper-muted p-3">
        <label className="flex items-center gap-2 text-sm font-medium text-ink-900">
          <input type="checkbox" checked={detractOn} onChange={(e) => setDetractOn(e.target.checked)} />
          Aplicar detracción SUNAT
        </label>
        <p className="mt-1 text-xs text-ash-500">
          La detracción (Sistema de Pago de Obligaciones Tributarias) no aplica automáticamente a toda venta — depende del tipo de servicio y del
          monto de cada operación. Actívala solo si tu contador confirmó que corresponde a Inkademy, y con el % que te indique.
        </p>
        {detractOn && (
          <div className="mt-2 max-w-[10rem]">
            <Label htmlFor="detraction-pct">Porcentaje de detracción</Label>
            <Input id="detraction-pct" type="number" min="0" max="100" step="0.01" value={detractPct} onChange={(e) => setDetractPct(e.target.value)} />
          </div>
        )}
      </div>

      <div>
        <Button size="sm" variant="outline" disabled={busy} onClick={handleSave}>
          {busy ? "…" : saved ? "Guardado ✓" : "Guardar"}
        </Button>
      </div>
      {error && <Callout variant="danger">{error}</Callout>}
    </div>
  );
}

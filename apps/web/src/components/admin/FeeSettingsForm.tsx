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
 *
 * Detracción: se reemplazó el % plano anterior por la tabla real que pidió
 * el admin — depende de qué comprobante recibe el comprador (boleta vs
 * factura) y, si es factura, de si el RUC es de persona natural con
 * negocio (empieza con "10") o empresa/persona jurídica (empieza con
 * "20"). Se calcula automáticamente por orden en AdminService.computeDetraction
 * — acá solo se configuran los % y el umbral, "por si algún día la SUNAT
 * cambia las reglas de juego".
 */
export function FeeSettingsForm({
  culqiFeePercent,
  stripeFeePercent,
  yapePlinFeePercent,
  detractionEnabled,
  detractionRucNaturalPercent,
  detractionRucNaturalThreshold,
  detractionRucEmpresaPercent,
}: {
  culqiFeePercent: number;
  stripeFeePercent: number;
  yapePlinFeePercent: number;
  detractionEnabled: boolean;
  detractionRucNaturalPercent: number;
  detractionRucNaturalThreshold: number;
  detractionRucEmpresaPercent: number;
}) {
  const router = useRouter();
  const [culqi, setCulqi] = useState(String(culqiFeePercent));
  const [stripe, setStripe] = useState(String(stripeFeePercent));
  const [yapePlin, setYapePlin] = useState(String(yapePlinFeePercent));
  const [detractOn, setDetractOn] = useState(detractionEnabled);
  const [rucNaturalPct, setRucNaturalPct] = useState(String(detractionRucNaturalPercent));
  const [rucNaturalThreshold, setRucNaturalThreshold] = useState(String(detractionRucNaturalThreshold));
  const [rucEmpresaPct, setRucEmpresaPct] = useState(String(detractionRucEmpresaPercent));
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
        yapePlinFeePercent: Number(yapePlin),
        detractionEnabled: detractOn,
        detractionRucNaturalPercent: Number(rucNaturalPct),
        detractionRucNaturalThreshold: Number(rucNaturalThreshold),
        detractionRucEmpresaPercent: Number(rucEmpresaPct),
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
        <div>
          <Label htmlFor="yapeplin-fee">Comisión adicional Yape/Plin (%)</Label>
          <Input
            id="yapeplin-fee"
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={yapePlin}
            onChange={(e) => setYapePlin(e.target.value)}
            className="w-28"
          />
        </div>
      </div>
      <p className="-mt-2 text-xs text-ash-500">
        Investigado a pedido: no encontramos evidencia de que BCP/Interbank/la billetera del Estado le cobren a Inkapitales (el comercio) un %
        adicional específico por aceptar Yape/Plin — Culqi factura una única comisión de "descuento de comercio" que ya cubre tarjeta + Yape/Plin.
        Se deja en 0% por defecto; súbelo solo si tu contrato con Culqi confirma un cargo adicional real.
      </p>

      <div className="rounded-md bg-paper-muted p-3">
        <label className="flex items-center gap-2 text-sm font-medium text-ink-900">
          <input type="checkbox" checked={detractOn} onChange={(e) => setDetractOn(e.target.checked)} />
          Aplicar detracción SUNAT
        </label>
        <p className="mt-1 text-xs text-ash-500">Interruptor maestro — si la SUNAT suspende la detracción por completo, apágalo aquí sin perder los % configurados.</p>

        {detractOn && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-ash-500">
                <tr>
                  <th className="p-1.5 font-medium">Tipo de cliente</th>
                  <th className="p-1.5 font-medium">Comprobante</th>
                  <th className="p-1.5 font-medium">¿Aplica detracción?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paper-border">
                <tr>
                  <td className="p-1.5">Persona natural (consumidor final)</td>
                  <td className="p-1.5">Boleta de venta</td>
                  <td className="p-1.5 text-ash-500">No — cobras el 100% directo</td>
                </tr>
                <tr>
                  <td className="p-1.5">Persona natural con negocio (RUC empieza con 10)</td>
                  <td className="p-1.5">Factura</td>
                  <td className="p-1.5">
                    Sí, {rucNaturalPct}% si supera{" "}
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={rucNaturalThreshold}
                      onChange={(e) => setRucNaturalThreshold(e.target.value)}
                      className="inline-block h-6 w-20 px-1 text-xs"
                    />{" "}
                    S/
                  </td>
                </tr>
                <tr>
                  <td className="p-1.5">Empresa / persona jurídica (RUC empieza con 20)</td>
                  <td className="p-1.5">Factura</td>
                  <td className="p-1.5">Sí, siempre — {rucEmpresaPct}% al Banco de la Nación, {100 - Number(rucEmpresaPct)}% a tu cuenta</td>
                </tr>
              </tbody>
            </table>
            <div className="mt-3 flex flex-wrap gap-3">
              <div>
                <Label htmlFor="detract-natural-pct">% detracción — persona natural con negocio</Label>
                <Input
                  id="detract-natural-pct"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={rucNaturalPct}
                  onChange={(e) => setRucNaturalPct(e.target.value)}
                  className="w-28"
                />
              </div>
              <div>
                <Label htmlFor="detract-empresa-pct">% detracción — empresa/persona jurídica</Label>
                <Input
                  id="detract-empresa-pct"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={rucEmpresaPct}
                  onChange={(e) => setRucEmpresaPct(e.target.value)}
                  className="w-28"
                />
              </div>
            </div>
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

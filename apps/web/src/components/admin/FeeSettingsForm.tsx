"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Receipt, ArrowLeftRight } from "lucide-react";
import { adminApi, ApiError } from "@/lib/api-client";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";

function SectionHeader({ icon: Icon, accent, title }: { icon: typeof CreditCard; accent: string; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`flex h-8 w-8 items-center justify-center rounded-full ${accent}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <h3 className="font-serif text-sm font-semibold text-ink-900">{title}</h3>
    </div>
  );
}

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
  yapeFeePercent,
  plinFeePercent,
  detractionEnabled,
  detractionRucNaturalPercent,
  detractionRucNaturalThreshold,
  detractionRucEmpresaPercent,
  usdExchangeRate,
  exchangeRateSourceUrl,
}: {
  culqiFeePercent: number;
  stripeFeePercent: number;
  yapeFeePercent: number;
  plinFeePercent: number;
  detractionEnabled: boolean;
  detractionRucNaturalPercent: number;
  detractionRucNaturalThreshold: number;
  detractionRucEmpresaPercent: number;
  usdExchangeRate: number;
  exchangeRateSourceUrl: string | null;
}) {
  const router = useRouter();
  const [culqi, setCulqi] = useState(String(culqiFeePercent));
  const [stripe, setStripe] = useState(String(stripeFeePercent));
  const [yape, setYape] = useState(String(yapeFeePercent));
  const [plin, setPlin] = useState(String(plinFeePercent));
  const [detractOn, setDetractOn] = useState(detractionEnabled);
  const [rucNaturalPct, setRucNaturalPct] = useState(String(detractionRucNaturalPercent));
  const [rucNaturalThreshold, setRucNaturalThreshold] = useState(String(detractionRucNaturalThreshold));
  const [rucEmpresaPct, setRucEmpresaPct] = useState(String(detractionRucEmpresaPercent));
  const [exchangeRate, setExchangeRate] = useState(String(usdExchangeRate));
  const [sourceUrl, setSourceUrl] = useState(exchangeRateSourceUrl ?? "");
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
        yapeFeePercent: Number(yape),
        plinFeePercent: Number(plin),
        detractionEnabled: detractOn,
        detractionRucNaturalPercent: Number(rucNaturalPct),
        detractionRucNaturalThreshold: Number(rucNaturalThreshold),
        detractionRucEmpresaPercent: Number(rucEmpresaPct),
        usdExchangeRate: Number(exchangeRate),
        exchangeRateSourceUrl: sourceUrl.trim() || null,
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
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-paper-border p-4">
        <SectionHeader icon={CreditCard} accent="bg-indigo-50 text-indigo-600" title="Comisiones de pasarela" />
        <p className="mt-2 text-xs text-ash-600">
          <span className="font-semibold text-ink-800">Culqi</span> se aplica a ventas en <strong>soles (PEN)</strong> — tarjeta, Yape, Plin,
          rieles nacionales. <span className="font-semibold text-ink-800">Stripe</span> se aplica a ventas en <strong>dólares (USD)</strong> —
          compradores internacionales. No son dos comisiones del mismo proveedor, cada una corresponde a una pasarela distinta según la moneda.
        </p>

        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="culqi-fee">Comisión Culqi (%) — ventas en soles</Label>
            <Input id="culqi-fee" type="number" min="0" max="100" step="0.01" value={culqi} onChange={(e) => setCulqi(e.target.value)} className="w-28" />
          </div>
          <div>
            <Label htmlFor="stripe-fee">Comisión Stripe (%) — ventas en dólares</Label>
            <Input id="stripe-fee" type="number" min="0" max="100" step="0.01" value={stripe} onChange={(e) => setStripe(e.target.value)} className="w-28" />
          </div>
          <div>
            <Label htmlFor="yape-fee">Comisión adicional Yape — BCP (%)</Label>
            <Input id="yape-fee" type="number" min="0" max="100" step="0.01" value={yape} onChange={(e) => setYape(e.target.value)} className="w-28" />
          </div>
          <div>
            <Label htmlFor="plin-fee">Comisión adicional Plin — Interbank (%)</Label>
            <Input id="plin-fee" type="number" min="0" max="100" step="0.01" value={plin} onChange={(e) => setPlin(e.target.value)} className="w-28" />
          </div>
        </div>
        <p className="mt-3 text-xs text-ash-500">
          Son comisiones <strong>separadas, no una sola</strong> — el costo por recibir Yape en cuenta empresa lo cobra <strong>BCP</strong>, y el
          costo por recibir Plin en cuenta empresa lo cobra <strong>Interbank</strong>; cada banco tiene su propia tasa, no hay razón para que
          coincidan. Cada % es <strong>adicional</strong> a la comisión de Culqi (que sigue cobrando su descuento de comercio aparte) y se aplica{" "}
          <strong>solo</strong> a los cobros que Culqi reporta como esa billetera puntual (nunca a tarjeta, y nunca ambas a la vez sobre un mismo
          cobro) — siempre sobre el monto <strong>bruto efectivamente cobrado (con IGV incluido)</strong>. Se dejan en 0% hasta que cargues la tasa
          real que te confirmó tu banco.
        </p>
      </div>

      <div className="rounded-lg border border-paper-border p-4">
        <SectionHeader icon={Receipt} accent="bg-gold-100 text-gold-700" title="Detracción SUNAT" />
        <label className="mt-3 flex items-center gap-2 text-sm font-medium text-ink-900">
          <input type="checkbox" checked={detractOn} onChange={(e) => setDetractOn(e.target.checked)} />
          Aplicar detracción SUNAT
        </label>
        <p className="mt-1 text-xs text-ash-500">Interruptor maestro — si la SUNAT suspende la detracción por completo, apágalo aquí sin perder los % configurados.</p>

        {detractOn && (
          <div className="mt-3 overflow-x-auto rounded-md border border-paper-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-paper-muted text-ash-500">
                <tr>
                  <th className="p-2.5 font-medium">Tipo de cliente</th>
                  <th className="p-2.5 font-medium">Comprobante</th>
                  <th className="p-2.5 font-medium">¿Aplica detracción?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paper-border">
                <tr>
                  <td className="p-2.5">Persona natural (consumidor final)</td>
                  <td className="p-2.5">Boleta de venta</td>
                  <td className="p-2.5 text-ash-500">No — cobras el 100% directo</td>
                </tr>
                <tr>
                  <td className="p-2.5">Persona natural con negocio (RUC empieza con 10)</td>
                  <td className="p-2.5">Factura</td>
                  <td className="p-2.5">
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
                  <td className="p-2.5">Empresa / persona jurídica (RUC empieza con 20)</td>
                  <td className="p-2.5">Factura</td>
                  <td className="p-2.5">Sí, siempre — {rucEmpresaPct}% al Banco de la Nación, {100 - Number(rucEmpresaPct)}% a tu cuenta</td>
                </tr>
              </tbody>
            </table>
            <div className="flex flex-wrap gap-3 border-t border-paper-border bg-paper-muted/50 p-3">
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

      {detractOn && (
        <div className="rounded-lg border border-paper-border p-4">
          <SectionHeader icon={ArrowLeftRight} accent="bg-indigo-50 text-indigo-600" title="Ventas en USD — tipo de cambio" />
          <p className="mt-2 text-xs text-ash-600">
            Aunque la factura sea en dólares, la detracción (cuando aplica) se calcula sobre el equivalente en soles y se deposita al Banco de la
            Nación en soles — nunca en dólares. Actualiza el tipo de cambio del día antes de cerrar el periodo; la fuente oficial recomendada es
            la SBS, pero puede cambiar de dirección, así que el link también es editable.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="usd-exchange-rate">Tipo de cambio USD → PEN (venta)</Label>
              <Input
                id="usd-exchange-rate"
                type="number"
                min="0"
                step="0.001"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
                className="w-28"
              />
            </div>
            <div className="min-w-[16rem] flex-1">
              <Label htmlFor="exchange-rate-source">Link de referencia (tipo de cambio del día)</Label>
              <Input
                id="exchange-rate-source"
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://www.sbs.gob.pe/..."
              />
            </div>
            {sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-indigo-600 underline">
                Ver tipo de cambio del día ↗
              </a>
            )}
          </div>
        </div>
      )}

      <div>
        <Button size="sm" variant="outline" disabled={busy} onClick={handleSave}>
          {busy ? "…" : saved ? "Guardado ✓" : "Guardar"}
        </Button>
      </div>
      {error && <Callout variant="danger">{error}</Callout>}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, ApiError } from "@/lib/api-client";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";

/**
 * Antes vivía dentro de /admin/facturacion — se separó a
 * /admin/configuracion junto con comisiones/detracción/IA (pedido
 * explícito: aislar lo que se parametriza en un módulo aparte). Por
 * defecto GRAVADO: "esta plataforma no está exonerada del IGV, no soy una
 * institución educativa. Cuando lo sea no aplicará".
 */
export function TaxSettingsForm({ taxAffectation, igvPercent }: { taxAffectation: "EXONERADO" | "GRAVADO"; igvPercent: number }) {
  const router = useRouter();
  const [affectation, setAffectation] = useState<"EXONERADO" | "GRAVADO">(taxAffectation);
  const [igv, setIgv] = useState(String(igvPercent));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await adminApi.updateSunatSettings({ taxAffectation: affectation, igvPercent: Number(igv) });
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
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="tax-affectation">¿Aplica IGV como Inkademy?</Label>
          <Select id="tax-affectation" value={affectation} onChange={(e) => setAffectation(e.target.value as "EXONERADO" | "GRAVADO")}>
            <option value="GRAVADO">Sí — Gravado ({igv}% IGV)</option>
            <option value="EXONERADO">No — Exonerado (solo si Inkapitales califica como institución educativa reconocida)</option>
          </Select>
          <p className="mt-1 text-xs text-ash-500">Por defecto Gravado: Inkapitales no es una institución educativa exonerada de IGV.</p>
        </div>
        <div>
          <Label htmlFor="tax-igv-percent">% de IGV vigente</Label>
          <Input id="tax-igv-percent" type="number" min="0" max="100" step="0.01" value={igv} onChange={(e) => setIgv(e.target.value)} />
          <p className="mt-1 text-xs text-ash-500">18% es la tasa vigente en Perú desde 2011 — la ley puede cambiarla.</p>
        </div>
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

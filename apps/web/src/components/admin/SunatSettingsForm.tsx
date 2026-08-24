"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, ApiError, type SunatSettingsDTO } from "@/lib/api-client";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

/**
 * Antes SUNAT_RUC/SUNAT_SOL_USER/SUNAT_SOL_PASSWORD/certificado/series solo
 * se podían configurar editando el .env del servidor — sin ninguna
 * pantalla. Los campos de secreto (clave SOL, certificado) se guardan
 * en blanco por defecto aunque ya estén configurados (placeholder
 * "•••••••• (ya configurado)") — dejarlos en blanco al guardar NO borra
 * lo existente, solo escribe un valor nuevo si el admin lo cambia.
 */
export function SunatSettingsForm({ settings }: { settings: SunatSettingsDTO }) {
  const router = useRouter();
  const [form, setForm] = useState({
    env: settings.env,
    ruc: settings.ruc ?? "",
    solUser: settings.solUser ?? "",
    solPassword: "",
    razonSocial: settings.razonSocial ?? "",
    address: settings.address ?? "",
    ubigeo: settings.ubigeo ?? "",
    boletaSeries: settings.boletaSeries ?? "",
    facturaSeries: settings.facturaSeries ?? "",
    boletaCreditSeries: settings.boletaCreditSeries ?? "",
    facturaCreditSeries: settings.facturaCreditSeries ?? "",
    certPem: "",
    certKeyPem: "",
    taxAffectation: settings.taxAffectation,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await adminApi.updateSunatSettings(form);
      setSaved(true);
      setForm((f) => ({ ...f, solPassword: "", certPem: "", certKeyPem: "" }));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar la configuración.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {saved && <Callout variant="success">Configuración guardada.</Callout>}
      {error && <Callout variant="danger">{error}</Callout>}

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Ambiente y credenciales</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="sunat-env">Ambiente</Label>
              <Select id="sunat-env" value={form.env} onChange={(e) => setForm((f) => ({ ...f, env: e.target.value as "beta" | "production" }))}>
                <option value="beta">Beta (pruebas)</option>
                <option value="production">Producción</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="sunat-ruc">RUC del emisor</Label>
              <Input id="sunat-ruc" value={form.ruc} onChange={(e) => setForm((f) => ({ ...f, ruc: e.target.value }))} placeholder="20123456789" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="sunat-sol-user">Usuario secundario SOL</Label>
              <Input id="sunat-sol-user" value={form.solUser} onChange={(e) => setForm((f) => ({ ...f, solUser: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="sunat-sol-password">Clave SOL</Label>
              <Input
                id="sunat-sol-password"
                type="password"
                value={form.solPassword}
                onChange={(e) => setForm((f) => ({ ...f, solPassword: e.target.value }))}
                placeholder={settings.hasSolPassword ? "•••••••• (ya configurada — deja en blanco para no cambiarla)" : "Sin configurar"}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Datos del emisor</h2>
          <div>
            <Label htmlFor="sunat-razon-social">Razón social</Label>
            <Input id="sunat-razon-social" value={form.razonSocial} onChange={(e) => setForm((f) => ({ ...f, razonSocial: e.target.value }))} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="sunat-address">Dirección</Label>
              <Input id="sunat-address" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="sunat-ubigeo">Ubigeo (INEI)</Label>
              <Input id="sunat-ubigeo" value={form.ubigeo} onChange={(e) => setForm((f) => ({ ...f, ubigeo: e.target.value }))} placeholder="150101" />
            </div>
          </div>
          <div>
            <Label htmlFor="sunat-tax">Afectación de IGV</Label>
            <Select id="sunat-tax" value={form.taxAffectation} onChange={(e) => setForm((f) => ({ ...f, taxAffectation: e.target.value as "EXONERADO" | "GRAVADO" }))}>
              <option value="EXONERADO">Exonerado (servicios de enseñanza reglada)</option>
              <option value="GRAVADO">Gravado (18% IGV)</option>
            </Select>
            <p className="mt-1 text-xs text-ash-500">Confirma con tu contador cuál corresponde a tu caso específico.</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Series de comprobantes</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="sunat-boleta-series">Serie de boleta</Label>
              <Input id="sunat-boleta-series" value={form.boletaSeries} onChange={(e) => setForm((f) => ({ ...f, boletaSeries: e.target.value }))} placeholder="B001" />
            </div>
            <div>
              <Label htmlFor="sunat-factura-series">Serie de factura</Label>
              <Input id="sunat-factura-series" value={form.facturaSeries} onChange={(e) => setForm((f) => ({ ...f, facturaSeries: e.target.value }))} placeholder="F001" />
            </div>
            <div>
              <Label htmlFor="sunat-boleta-credit-series">Serie de nota de crédito (boleta)</Label>
              <Input
                id="sunat-boleta-credit-series"
                value={form.boletaCreditSeries}
                onChange={(e) => setForm((f) => ({ ...f, boletaCreditSeries: e.target.value }))}
                placeholder="BC01"
              />
            </div>
            <div>
              <Label htmlFor="sunat-factura-credit-series">Serie de nota de crédito (factura)</Label>
              <Input
                id="sunat-factura-credit-series"
                value={form.facturaCreditSeries}
                onChange={(e) => setForm((f) => ({ ...f, facturaCreditSeries: e.target.value }))}
                placeholder="FC01"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Certificado digital</h2>
          <p className="text-sm text-ash-500">
            Solo necesario en producción — sin esto, el sistema firma con un certificado autofirmado válido para el
            ambiente beta. Pega el contenido del archivo .pem tal cual, incluyendo las líneas BEGIN/END.
          </p>
          <div>
            <Label htmlFor="sunat-cert-pem">Certificado (.pem)</Label>
            <textarea
              id="sunat-cert-pem"
              className="min-h-[5rem] w-full rounded-md border border-paper-border bg-paper p-2 text-xs font-mono"
              value={form.certPem}
              onChange={(e) => setForm((f) => ({ ...f, certPem: e.target.value }))}
              placeholder={settings.hasCertPem ? "Ya configurado — deja en blanco para no cambiarlo" : "-----BEGIN CERTIFICATE-----"}
            />
          </div>
          <div>
            <Label htmlFor="sunat-cert-key-pem">Llave privada (.pem)</Label>
            <textarea
              id="sunat-cert-key-pem"
              className="min-h-[5rem] w-full rounded-md border border-paper-border bg-paper p-2 text-xs font-mono"
              value={form.certKeyPem}
              onChange={(e) => setForm((f) => ({ ...f, certKeyPem: e.target.value }))}
              placeholder={settings.hasCertKeyPem ? "Ya configurada — deja en blanco para no cambiarla" : "-----BEGIN PRIVATE KEY-----"}
            />
          </div>
        </CardContent>
      </Card>

      <Button size="lg" className="self-start" disabled={saving} onClick={handleSave}>
        {saving ? "Guardando…" : "Guardar cambios"}
      </Button>
    </div>
  );
}

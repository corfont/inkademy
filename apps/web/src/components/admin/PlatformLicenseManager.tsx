"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { platformLicenseApi, ApiError, type PlatformLicenseDTO } from "@/lib/api-client";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge, type BadgeProps } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

const STATUS_LABEL: Record<PlatformLicenseDTO["status"], string> = {
  ACTIVE: "Activa",
  EXPIRING_SOON: "Por vencer",
  EXPIRED: "Vencida",
  CANCELLED: "Cancelada",
};
const STATUS_VARIANT: Record<PlatformLicenseDTO["status"], BadgeProps["variant"]> = {
  ACTIVE: "success",
  EXPIRING_SOON: "warning",
  EXPIRED: "danger",
  CANCELLED: "neutral",
};

function toDateInput(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * "Arrendar este sistema" (instancia aislada / marca blanca) — este panel
 * es un registro de NEGOCIO de Inkapitales sobre sus clientes que
 * arriendan una instancia completa desplegada aparte (ver
 * docs/aprovisionar-instancia-arrendada.md). No aprovisiona ni administra
 * esa instancia — solo lleva la cuenta de quién, desde cuándo, hasta
 * cuándo y a qué precio, para que el sweep de vencimiento avise a tiempo.
 */
export function PlatformLicenseManager({ licenses }: { licenses: PlatformLicenseDTO[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    clientName: "",
    domain: "",
    deploymentUrl: "",
    billingCycle: "ANNUAL" as "MONTHLY" | "ANNUAL",
    priceAmount: "",
    currency: "PEN" as "PEN" | "USD",
    startsAt: "",
    endsAt: "",
    notes: "",
  });

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ocurrió un error.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    if (!form.clientName.trim() || !form.priceAmount || !form.startsAt || !form.endsAt) {
      setError("Completa cliente, precio, y fechas de inicio/fin.");
      return;
    }
    await run(async () => {
      await platformLicenseApi.create({
        clientName: form.clientName,
        domain: form.domain || null,
        deploymentUrl: form.deploymentUrl || null,
        billingCycle: form.billingCycle,
        priceAmount: Number(form.priceAmount),
        currency: form.currency,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        notes: form.notes || null,
      });
      setForm({ clientName: "", domain: "", deploymentUrl: "", billingCycle: "ANNUAL", priceAmount: "", currency: "PEN", startsAt: "", endsAt: "", notes: "" });
    });
  }

  async function handleStatusChange(id: string, status: PlatformLicenseDTO["status"]) {
    await run(() => platformLicenseApi.update(id, { status }));
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar esta licencia? Esta acción no se puede deshacer.")) return;
    await run(() => platformLicenseApi.remove(id));
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <Callout variant="danger">{error}</Callout>}

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Nueva licencia</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="pl-client">Cliente</Label>
              <Input id="pl-client" value={form.clientName} onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="pl-domain">Dominio propio (opcional)</Label>
              <Input id="pl-domain" placeholder="cursos.cliente.com" value={form.domain} onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="pl-url">URL de la instancia (opcional)</Label>
              <Input id="pl-url" placeholder="https://…" value={form.deploymentUrl} onChange={(e) => setForm((f) => ({ ...f, deploymentUrl: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="pl-cycle">Ciclo de facturación</Label>
              <Select id="pl-cycle" value={form.billingCycle} onChange={(e) => setForm((f) => ({ ...f, billingCycle: e.target.value as "MONTHLY" | "ANNUAL" }))}>
                <option value="MONTHLY">Mensual</option>
                <option value="ANNUAL">Anual</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="pl-price">Precio</Label>
              <Input id="pl-price" type="number" min="0" step="0.01" value={form.priceAmount} onChange={(e) => setForm((f) => ({ ...f, priceAmount: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="pl-currency">Moneda</Label>
              <Select id="pl-currency" value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value as "PEN" | "USD" }))}>
                <option value="PEN">PEN</option>
                <option value="USD">USD</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="pl-starts">Inicio</Label>
              <Input id="pl-starts" type="date" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="pl-ends">Vencimiento</Label>
              <Input id="pl-ends" type="date" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label htmlFor="pl-notes">Notas (opcional)</Label>
            <Input id="pl-notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          <div>
            <Button onClick={handleCreate} disabled={busy}>
              {busy ? "Guardando…" : "Registrar licencia"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col divide-y divide-paper-border p-0">
          {licenses.length === 0 && <p className="p-6 text-sm text-ash-500">Todavía no hay licencias registradas.</p>}
          {licenses.map((license) => (
            <div key={license.id} className="flex flex-col gap-2 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink-900">{license.clientName}</span>
                  <Badge variant={STATUS_VARIANT[license.status]}>{STATUS_LABEL[license.status]}</Badge>
                </div>
                <p className="mt-1 text-sm text-ash-500">
                  {license.currency} {Number(license.priceAmount).toLocaleString("es-PE", { minimumFractionDigits: 2 })} ·{" "}
                  {license.billingCycle === "MONTHLY" ? "mensual" : "anual"} · vence el {toDateInput(license.endsAt)}
                  {license.domain ? ` · ${license.domain}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={license.status}
                  onChange={(e) => handleStatusChange(license.id, e.target.value as PlatformLicenseDTO["status"])}
                  className="w-40"
                >
                  <option value="ACTIVE">Activa</option>
                  <option value="EXPIRING_SOON">Por vencer</option>
                  <option value="EXPIRED">Vencida</option>
                  <option value="CANCELLED">Cancelada</option>
                </Select>
                <button
                  type="button"
                  onClick={() => handleDelete(license.id)}
                  aria-label="Eliminar licencia"
                  className="rounded-md p-2 text-ash-500 hover:bg-danger-bg hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

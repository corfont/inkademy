"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { companyApi, ApiError } from "@/lib/api-client";
import { Select, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";

const OPTIONS: Record<string, string> = {
  STUDENT: "Solo al colaborador",
  COMPANY_ADMIN: "Solo al administrador de la empresa",
  BOTH: "Al colaborador y al administrador",
};

/**
 * "El administrador puede escoger si quiere que los certificados le
 * lleguen al administrador, al usuario o a ambos" — decide a dónde llega
 * el CORREO cuando un certificado se emite automáticamente. La descarga
 * desde la plataforma siempre está disponible para el colaborador, sin
 * importar esta opción (ver la nota que se le muestra en /campus/certificados).
 */
export function CertificateDeliverySettingsForm({ companyId, initialTarget }: { companyId: string; initialTarget: string }) {
  const router = useRouter();
  const [target, setTarget] = useState(initialTarget);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await companyApi.updateCertificateSettings(companyId, target as "STUDENT" | "COMPANY_ADMIN" | "BOTH");
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar la configuración.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-paper-border bg-paper p-4">
      <Label htmlFor="cert-delivery-target">¿A quién se envía por correo el certificado al emitirse?</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Select id="cert-delivery-target" className="max-w-xs" value={target} onChange={(e) => setTarget(e.target.value)}>
          {Object.entries(OPTIONS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Button size="sm" variant="outline" disabled={busy || target === initialTarget} onClick={handleSave}>
          {busy ? "…" : saved ? "Guardado ✓" : "Guardar"}
        </Button>
      </div>
      {error && <Callout variant="danger">{error}</Callout>}
      <p className="text-xs text-ash-500">
        La descarga del certificado desde la plataforma siempre está disponible para el colaborador — esto solo cambia a dónde llega el aviso por
        correo.
      </p>
    </div>
  );
}

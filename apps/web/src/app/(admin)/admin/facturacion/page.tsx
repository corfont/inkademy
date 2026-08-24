import type { Metadata } from "next";
import { adminApi } from "@/lib/api-client";
import { getServerAccessToken } from "@/lib/server-auth";
import { SunatSettingsForm } from "@/components/admin/SunatSettingsForm";

export const metadata: Metadata = { title: "Facturación electrónica" };

export default async function SunatSettingsPage() {
  const accessToken = getServerAccessToken();
  const settings = await adminApi.sunatSettings(accessToken);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 font-serif text-2xl font-semibold text-ink-900">Facturación electrónica (SUNAT)</h1>
      <p className="mb-6 text-sm text-ash-500">
        RUC, usuario y clave SOL, series y certificado para emitir boletas, facturas y notas de crédito/débito
        automáticamente. Sin esto configurado, el sistema genera y firma el comprobante pero no lo envía a SUNAT
        (queda en modo simulado — igual que las pasarelas de pago sin sus credenciales).
      </p>
      <SunatSettingsForm settings={settings} />
    </div>
  );
}

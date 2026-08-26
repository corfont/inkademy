import type { Metadata } from "next";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { ReportsCenter } from "@/components/admin/ReportsCenter";
import { Callout } from "@/components/ui/Callout";

export const metadata: Metadata = { title: "Reportes (admin)" };

export default async function ReportsPage() {
  const accessToken = getServerAccessToken();
  const { data: catalog, live } = await withFallback(() => adminApi.reportsCatalog(accessToken), [] as any[]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Reportes</h1>
        <p className="mt-1 text-sm text-ash-500">
          Documentos PDF listos para compartir — con logo, sello de agua y el mismo formato en todos: A4, márgenes 2.5cm, texto justificado.
        </p>
      </div>
      {!live && <Callout variant="info">No pudimos conectar con la API — no se muestra el catálogo real por ahora.</Callout>}
      <ReportsCenter catalog={catalog} />
    </div>
  );
}

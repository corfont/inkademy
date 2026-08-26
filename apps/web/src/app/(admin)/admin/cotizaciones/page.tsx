import type { Metadata } from "next";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { QuotesPipelineManager } from "@/components/admin/QuotesPipelineManager";
import { Callout } from "@/components/ui/Callout";

export const metadata: Metadata = { title: "Cotizaciones (admin)" };

export default async function AdminQuotesPage() {
  const accessToken = getServerAccessToken();
  const { data: quotes, live } = await withFallback(() => adminApi.quotes(accessToken), [] as any[]);
  const { data: courses } = await withFallback(() => adminApi.courses(accessToken), [] as any[]);
  const { data: programs } = await withFallback(() => adminApi.programs(accessToken), [] as any[]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Cotizaciones</h1>
        <p className="mt-1 text-sm text-ash-500">
          Pipeline comercial B2B: pedidos de cotización de todas las empresas, respóndelos con un monto real, y conviértelos en cupos cuando la
          empresa acepte.
        </p>
      </div>
      {!live && <Callout variant="info">No pudimos conectar con la API — no se muestran cotizaciones reales por ahora.</Callout>}
      <QuotesPipelineManager quotes={quotes} courses={courses} programs={programs} />
    </div>
  );
}

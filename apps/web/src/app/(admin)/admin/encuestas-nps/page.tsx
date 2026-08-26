import type { Metadata } from "next";
import { npsAdminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { NpsSurveyManager } from "@/components/admin/NpsSurveyManager";
import { Callout } from "@/components/ui/Callout";

export const metadata: Metadata = { title: "Encuestas NPS (admin)" };

export default async function AdminNpsPage() {
  const accessToken = getServerAccessToken();
  const { data: question, live } = await withFallback(
    () => npsAdminApi.question(accessToken),
    { question: { es: "¿Qué tan probable es que recomiendes Inkademy a otra empresa?" }, active: true, updatedAt: null },
  );
  const { data: companies } = await withFallback(() => npsAdminApi.companies(accessToken), []);
  const { data: results } = await withFallback(
    () => npsAdminApi.results(undefined, accessToken),
    { npsScore: null, totalResponses: 0, promoters: 0, passives: 0, detractors: 0, responses: [] },
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Encuestas NPS</h1>
        <p className="mt-1 text-sm text-ash-500">
          Mide qué tan satisfechas están las empresas con una sola pregunta. Se envía por correo al administrador de cada empresa y responde sin
          iniciar sesión.
        </p>
      </div>
      {!live && <Callout variant="info">No pudimos conectar con la API — no se muestran datos reales por ahora.</Callout>}
      <NpsSurveyManager initialQuestion={question} initialCompanies={companies} initialResults={results} />
    </div>
  );
}

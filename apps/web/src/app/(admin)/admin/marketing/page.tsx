import type { Metadata } from "next";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { EmailCampaignManager } from "@/components/admin/EmailCampaignManager";
import { MailingListManager } from "@/components/admin/MailingListManager";
import { Callout } from "@/components/ui/Callout";

export const metadata: Metadata = { title: "Marketing por correo (admin)" };

export default async function MarketingPage() {
  const accessToken = getServerAccessToken();
  // withFallback: si la API no responde, se muestra la pantalla vacía con
  // un aviso en vez de tirar al genérico error boundary de Next — mismo
  // patrón que ya usan /admin/ordenes, /admin/matriculas, etc.
  const { data: campaigns, live: campaignsLive } = await withFallback(() => adminApi.emailCampaigns(accessToken), [] as any[]);
  const { data: mailingLists } = await withFallback(() => adminApi.mailingLists(accessToken), [] as any[]);
  const { data: areas } = await withFallback(() => adminApi.areas(accessToken), [] as any[]);
  const { data: companies } = await withFallback(() => adminApi.companies(accessToken), [] as any[]);
  const { data: courses } = await withFallback(() => adminApi.courses(accessToken), [] as any[]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Marketing por correo</h1>
        <p className="mt-1 text-sm text-ash-500">
          Campañas manuales o redactadas automáticamente con IA (cursos relacionados, nuevos, con descuento, o por interés) — el envío se hace en
          segundo plano, solo a quienes aceptaron recibir correos de marketing.
        </p>
      </div>
      {!campaignsLive && <Callout variant="info">No pudimos conectar con la API — no se muestran campañas reales por ahora.</Callout>}
      <EmailCampaignManager campaigns={campaigns} areas={areas} companies={companies} courses={courses} mailingLists={mailingLists} />
      <hr className="border-paper-border" />
      <MailingListManager lists={mailingLists} areas={areas} companies={companies} courses={courses} />
    </div>
  );
}

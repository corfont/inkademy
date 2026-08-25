import type { Metadata } from "next";
import { adminApi } from "@/lib/api-client";
import { getServerAccessToken } from "@/lib/server-auth";
import { EmailCampaignManager } from "@/components/admin/EmailCampaignManager";

export const metadata: Metadata = { title: "Marketing por correo (admin)" };

export default async function MarketingPage() {
  const accessToken = getServerAccessToken();
  const [campaigns, areas, companies] = await Promise.all([
    adminApi.emailCampaigns(accessToken),
    adminApi.areas(accessToken),
    adminApi.companies(accessToken),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Marketing por correo</h1>
        <p className="mt-1 text-sm text-ash-500">
          Campañas manuales o redactadas automáticamente con IA (cursos relacionados, nuevos, con descuento, o por interés) — el envío se hace en
          segundo plano, solo a quienes aceptaron recibir correos de marketing.
        </p>
      </div>
      <EmailCampaignManager campaigns={campaigns} areas={areas} companies={companies} />
    </div>
  );
}

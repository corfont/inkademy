import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Users, Ticket, TrendingUp, AlertTriangle } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { companyApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { MOCK_COMPANY_DASHBOARD } from "@/lib/mock-data";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/Card";
import { Callout } from "@/components/ui/Callout";
import { localize, formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Panel de empresa" };

export default async function CompanyDashboardPage({ params }: { params: { companyId: string } }) {
  const t = await getTranslations("empresa.dashboard");
  const locale = await getLocale();
  const accessToken = cookies().get(ACCESS_TOKEN_COOKIE)?.value ?? null;

  const { data: dashboard, live } = await withFallback(
    () => companyApi.dashboard(params.companyId, accessToken),
    { ...MOCK_COMPANY_DASHBOARD, companyId: params.companyId },
  );

  const kpis = [
    { label: t("activeParticipants"), value: dashboard.activeParticipants, icon: Users },
    { label: t("seatsAvailable"), value: dashboard.seatsAvailable, icon: Ticket },
    { label: t("averageProgress"), value: `${Math.round(dashboard.averageProgressPct)}%`, icon: TrendingUp },
    { label: t("atRisk"), value: dashboard.atRiskParticipants, icon: AlertTriangle },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">{dashboard.legalName}</h1>
      </div>

      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-5">
              <kpi.icon className="h-5 w-5 text-ink-700" aria-hidden="true" />
              <p className="mt-3 font-serif text-3xl font-semibold text-ink-900">{kpi.value}</p>
              <p className="text-sm text-ash-500">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <section>
        <h2 className="mb-3 font-serif text-lg font-semibold text-ink-900">{t("upcomingLive")}</h2>
        <div className="flex flex-col gap-3">
          {dashboard.upcomingLiveSessions.map((session, idx) => (
            <Card key={idx}>
              <CardContent className="flex items-center justify-between p-4">
                <p className="font-medium text-ink-900">{localize(session.courseTitle, locale)}</p>
                <p className="text-sm text-ash-500">{formatDateTime(session.startsAt, locale)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

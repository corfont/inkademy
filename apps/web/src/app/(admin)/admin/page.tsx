import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AlertTriangle, TrendingUp, Users, UserX, Award, LifeBuoy } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { MOCK_ADMIN_EXCEPTIONS } from "@/lib/mock-data";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { formatDateTime, formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Panel de administración" };

const MOCK_KPIS = {
  salesAmount: "184320.00",
  salesCurrency: "PEN",
  enrollments: 612,
  activeStudents: 428,
  atRiskStudents: 37,
  certificatesIssued: 189,
  openTickets: 14,
};

const SEVERITY_VARIANT: Record<string, "danger" | "warning" | "neutral"> = { HIGH: "danger", MEDIUM: "warning", LOW: "neutral" };

const EXCEPTION_ICON = {
  PAYMENT_WITHOUT_ENROLLMENT: AlertTriangle,
  STUDENT_WITHOUT_ACCESS_BEFORE_CLASS: Users,
  COURSE_WITHOUT_TEACHER: UserX,
  COMPANY_SEATS_EXPIRING: AlertTriangle,
  EXAM_PENDING_REVIEW: LifeBuoy,
} as const;

export default async function AdminDashboardPage() {
  const t = await getTranslations("admin.dashboard");
  const tSeverity = await getTranslations("admin.exceptions.severity");
  const locale = await getLocale();
  const accessToken = cookies().get(ACCESS_TOKEN_COOKIE)?.value ?? null;

  const [{ data: kpis, live: liveKpis }, { data: exceptions, live: liveExceptions }] = await Promise.all([
    withFallback(() => adminApi.kpis(accessToken), MOCK_KPIS),
    withFallback(() => adminApi.exceptions(accessToken), MOCK_ADMIN_EXCEPTIONS),
  ]);

  const kpiCards = [
    { label: t("sales"), value: formatPrice(kpis.salesAmount, kpis.salesCurrency, locale), icon: TrendingUp },
    { label: t("enrollments"), value: kpis.enrollments, icon: Users },
    { label: t("activeStudents"), value: kpis.activeStudents, icon: Users },
    { label: t("atRiskStudents"), value: kpis.atRiskStudents, icon: UserX },
    { label: t("certificatesIssued"), value: kpis.certificatesIssued, icon: Award },
    { label: t("openTickets"), value: kpis.openTickets, icon: LifeBuoy },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      {(!liveKpis || !liveExceptions) && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      <section>
        <h1 className="mb-4 font-serif text-2xl font-semibold text-ink-900">{t("kpisTitle")}</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kpiCards.map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="p-5">
                <kpi.icon className="h-5 w-5 text-ink-700" aria-hidden="true" />
                <p className="mt-3 font-serif text-2xl font-semibold text-ink-900">{kpi.value}</p>
                <p className="text-sm text-ash-500">{kpi.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="exceptions-heading" className="rounded-lg border-2 border-gold-300 bg-gold-50 p-6">
        <h2 id="exceptions-heading" className="mb-4 flex items-center gap-2 font-serif text-xl font-semibold text-ink-900">
          <AlertTriangle className="h-5 w-5 text-gold-600" aria-hidden="true" />
          {t("exceptionsTitle")}
        </h2>
        {exceptions.length === 0 ? (
          <p className="text-ash-600">{t("exceptionsEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {exceptions.map((exception) => {
              const Icon = EXCEPTION_ICON[exception.type] ?? AlertTriangle;
              return (
                <li key={exception.id} className="flex items-start gap-3 rounded-md bg-paper p-4 shadow-card">
                  <Icon className="mt-0.5 h-5 w-5 flex-none text-ink-700" aria-hidden="true" />
                  <div className="flex-1">
                    <p className="text-sm text-ink-900">{exception.message}</p>
                    <p className="mt-1 text-xs text-ash-500">{formatDateTime(exception.createdAt, locale)}</p>
                  </div>
                  <Badge variant={SEVERITY_VARIANT[exception.severity]}>{tSeverity(exception.severity)}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

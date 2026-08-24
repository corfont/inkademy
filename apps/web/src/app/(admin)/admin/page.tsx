import type { Metadata } from "next";
import { AlertTriangle, TrendingUp, Users, UserX, Award, LifeBuoy } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { MOCK_ADMIN_EXCEPTIONS } from "@/lib/mock-data";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { formatDateTime, formatPrice, localize } from "@/lib/format";

export const metadata: Metadata = { title: "Panel de administración" };

// Antes esta pantalla crasheaba con cualquier dato REAL: MOCK_KPIS tenía un
// shape plano (kpis.enrollments = 612), pero AdminService.getKpis() siempre
// devolvió un shape anidado (kpis.enrollments = {total, bySource}) — React
// tira "Objects are not valid as a React child" al intentar renderizar ese
// objeto directo. El mock nunca se puso a prueba contra la API real.
const MOCK_KPIS = {
  sales: { last30dTotal: "184320.00", last30dOrders: 42, totalPaidOrders: 210 },
  enrollments: { total: 612, bySource: [] as { source: string; count: number }[] },
  students: { active: 428, atRisk: 37 },
  certificatesIssued: 189,
  tickets: [] as { status: string; count: number }[],
  topCourses: [] as { courseId: string | null; title: Record<string, string> | null; enrollments: number }[],
  topCompanies: [] as { companyId: string | null; legalName: string; totalPaid: string }[],
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
  const accessToken = getServerAccessToken();

  const [{ data: kpis, live: liveKpis }, { data: exceptions, live: liveExceptions }] = await Promise.all([
    withFallback(() => adminApi.kpis(accessToken), MOCK_KPIS),
    withFallback(() => adminApi.exceptions(accessToken), MOCK_ADMIN_EXCEPTIONS),
  ]);

  const kpiCards = [
    { label: t("sales"), value: formatPrice(kpis.sales.last30dTotal, "PEN", locale), icon: TrendingUp },
    { label: t("enrollments"), value: kpis.enrollments.total, icon: Users },
    { label: t("activeStudents"), value: kpis.students.active, icon: Users },
    { label: t("atRiskStudents"), value: kpis.students.atRisk, icon: UserX },
    { label: t("certificatesIssued"), value: kpis.certificatesIssued, icon: Award },
    {
      label: t("openTickets"),
      value: kpis.tickets.reduce((sum: number, s: { status: string; count: number }) => (s.status === "OPEN" ? sum + s.count : sum), 0),
      icon: LifeBuoy,
    },
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

      <section className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <h2 className="mb-3 font-serif text-lg font-semibold text-ink-900">Cursos más solicitados</h2>
            {kpis.topCourses.length === 0 ? (
              <p className="text-sm text-ash-500">Todavía no hay matrículas suficientes.</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {kpis.topCourses.map((c: (typeof MOCK_KPIS)["topCourses"][number], i: number) => (
                  <li key={c.courseId ?? i} className="flex items-center justify-between text-sm">
                    <span className="text-ink-900">
                      {i + 1}. {c.title ? localize(c.title, locale) : "—"}
                    </span>
                    <Badge variant="outline">{c.enrollments} matrículas</Badge>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h2 className="mb-3 font-serif text-lg font-semibold text-ink-900">Empresas que más compran</h2>
            {kpis.topCompanies.length === 0 ? (
              <p className="text-sm text-ash-500">Todavía no hay compras B2B pagadas.</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {kpis.topCompanies.map((c: (typeof MOCK_KPIS)["topCompanies"][number], i: number) => (
                  <li key={c.companyId ?? i} className="flex items-center justify-between text-sm">
                    <span className="text-ink-900">
                      {i + 1}. {c.legalName}
                    </span>
                    <Badge variant="outline">{formatPrice(c.totalPaid, "PEN", locale)}</Badge>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
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

import type { Metadata } from "next";
import { AlertTriangle, TrendingUp, Users, UserX, Award, LifeBuoy, CheckCircle2 } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { MOCK_ADMIN_EXCEPTIONS } from "@/lib/mock-data";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { DashboardCharts } from "@/components/admin/DashboardCharts";
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

const MOCK_KPI_CHARTS = {
  revenueByMonth: [] as { month: string; total: number }[],
  enrollmentsByMonth: [] as { month: string; count: number }[],
  enrollmentsByStatus: [] as { status: string; count: number }[],
  coursesByArea: [] as { area: string; count: number }[],
};

const SEVERITY_VARIANT: Record<string, "danger" | "warning" | "neutral"> = { HIGH: "danger", MEDIUM: "warning", LOW: "neutral" };
const SEVERITY_BORDER: Record<string, string> = { HIGH: "border-l-danger", MEDIUM: "border-l-warning", LOW: "border-l-ash-300" };

const EXCEPTION_ICON = {
  PAYMENT_WITHOUT_ENROLLMENT: AlertTriangle,
  STUDENT_WITHOUT_ACCESS_BEFORE_CLASS: Users,
  COURSE_WITHOUT_TEACHER: UserX,
  COMPANY_SEATS_EXPIRING: AlertTriangle,
  EXAM_PENDING_REVIEW: LifeBuoy,
} as const;

// Semaforización simple: cada KPI que admite un umbral de riesgo se pinta
// verde/ámbar/rojo según qué tan lejos está de "todo bien" — antes cada
// tarjeta era un número neutro sin ninguna lectura de "¿esto está mal?".
type Health = "good" | "warn" | "bad";
const HEALTH_DOT: Record<Health, string> = { good: "bg-success", warn: "bg-warning", bad: "bg-danger" };

export default async function AdminDashboardPage() {
  const t = await getTranslations("admin.dashboard");
  const tSeverity = await getTranslations("admin.exceptions.severity");
  const locale = await getLocale();
  const accessToken = getServerAccessToken();

  const [{ data: kpis, live: liveKpis }, { data: exceptions, live: liveExceptions }, { data: charts, live: liveCharts }] = await Promise.all([
    withFallback(() => adminApi.kpis(accessToken), MOCK_KPIS),
    withFallback(() => adminApi.exceptions(accessToken), MOCK_ADMIN_EXCEPTIONS),
    withFallback(() => adminApi.kpiCharts(accessToken), MOCK_KPI_CHARTS),
  ]);

  const openTickets = kpis.tickets.reduce((sum: number, s: { status: string; count: number }) => (s.status === "OPEN" ? sum + s.count : sum), 0);
  const atRiskPct = kpis.students.active > 0 ? (kpis.students.atRisk / kpis.students.active) * 100 : 0;

  const atRiskHealth: Health = atRiskPct === 0 ? "good" : atRiskPct < 8 ? "warn" : "bad";
  const ticketsHealth: Health = openTickets === 0 ? "good" : openTickets <= 5 ? "warn" : "bad";
  const highExceptions = exceptions.filter((e) => e.severity === "HIGH").length;
  const exceptionsHealth: Health = highExceptions === 0 ? (exceptions.length === 0 ? "good" : "warn") : "bad";

  const overallHealth: Health = [atRiskHealth, ticketsHealth, exceptionsHealth].includes("bad")
    ? "bad"
    : [atRiskHealth, ticketsHealth, exceptionsHealth].includes("warn")
      ? "warn"
      : "good";

  const kpiCards: Array<{ label: string; value: string | number; icon: typeof TrendingUp; health?: Health }> = [
    { label: t("sales"), value: formatPrice(kpis.sales.last30dTotal, "PEN", locale), icon: TrendingUp },
    { label: t("enrollments"), value: kpis.enrollments.total, icon: Users },
    { label: t("activeStudents"), value: kpis.students.active, icon: Users },
    { label: t("atRiskStudents"), value: kpis.students.atRisk, icon: UserX, health: atRiskHealth },
    { label: t("certificatesIssued"), value: kpis.certificatesIssued, icon: Award },
    { label: t("openTickets"), value: openTickets, icon: LifeBuoy, health: ticketsHealth },
  ];

  const OVERALL_COPY: Record<Health, string> = {
    good: "Todo en orden — sin excepciones críticas abiertas",
    warn: "Hay puntos que conviene revisar esta semana",
    bad: "Hay excepciones de alta severidad que requieren atención ahora",
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      {(!liveKpis || !liveExceptions || !liveCharts) && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      {/* Semáforo general: la primera cosa que el admin debe poder leer sin
          hacer ningún esfuerzo — "¿tengo que actuar hoy o no?" */}
      <section
        className={`flex items-center gap-4 rounded-lg border-2 p-5 ${
          overallHealth === "good" ? "border-success bg-success-bg" : overallHealth === "warn" ? "border-warning bg-warning-bg" : "border-danger bg-danger-bg"
        }`}
      >
        <span className={`flex h-4 w-4 flex-none rounded-full ${HEALTH_DOT[overallHealth]} ${overallHealth !== "good" ? "animate-pulse" : ""}`} aria-hidden="true" />
        <div>
          <p className="font-serif text-lg font-semibold text-ink-900">
            {overallHealth === "good" ? "Estado general: saludable" : overallHealth === "warn" ? "Estado general: atención" : "Estado general: crítico"}
          </p>
          <p className="text-sm text-ash-600">{OVERALL_COPY[overallHealth]}</p>
        </div>
      </section>

      <section>
        <h1 className="mb-4 font-serif text-2xl font-semibold text-ink-900">{t("kpisTitle")}</h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kpiCards.map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <kpi.icon className="h-5 w-5 text-ink-700" aria-hidden="true" />
                  {kpi.health && (
                    <span className="flex items-center gap-1.5" title={`Semáforo: ${kpi.health}`}>
                      <span className={`h-2.5 w-2.5 rounded-full ${HEALTH_DOT[kpi.health]}`} aria-hidden="true" />
                    </span>
                  )}
                </div>
                <p className="mt-3 font-serif text-2xl font-semibold text-ink-900">{kpi.value}</p>
                <p className="text-sm text-ash-500">{kpi.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-serif text-xl font-semibold text-ink-900">Tendencias y distribución</h2>
        <DashboardCharts data={charts} ticketsByStatus={kpis.tickets} />
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
                  <li key={c.courseId ?? i} className="flex items-center gap-3 text-sm">
                    <span
                      className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-bold text-white ${
                        i === 0 ? "bg-gold-500" : i === 1 ? "bg-ash-400" : i === 2 ? "bg-amber-700" : "bg-ink-200 text-ink-700"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="flex-1 text-ink-900">{c.title ? localize(c.title, locale) : "—"}</span>
                    <Badge variant="ink">{c.enrollments} matrículas</Badge>
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
                  <li key={c.companyId ?? i} className="flex items-center gap-3 text-sm">
                    <span
                      className={`flex h-6 w-6 flex-none items-center justify-center rounded-full text-xs font-bold text-white ${
                        i === 0 ? "bg-gold-500" : i === 1 ? "bg-ash-400" : i === 2 ? "bg-amber-700" : "bg-ink-200 text-ink-700"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="flex-1 text-ink-900">{c.legalName}</span>
                    <Badge variant="gold">{formatPrice(c.totalPaid, "PEN", locale)}</Badge>
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
          <p className="flex items-center gap-2 text-ash-600">
            <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />
            {t("exceptionsEmpty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {exceptions.map((exception) => {
              const Icon = EXCEPTION_ICON[exception.type] ?? AlertTriangle;
              return (
                <li
                  key={exception.id}
                  className={`flex items-start gap-3 rounded-md border-l-4 bg-paper p-4 shadow-card ${SEVERITY_BORDER[exception.severity]}`}
                >
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

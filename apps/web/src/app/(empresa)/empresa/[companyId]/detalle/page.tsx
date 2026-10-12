import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getLocale } from "next-intl/server";
import { companyApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { localize, formatDate } from "@/lib/format";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Detalle del panel" };

interface Row {
  userId: string;
  userName: string;
  team: string | null;
  courseTitle: Record<string, string> | null;
  progressPct: number;
  status: string;
  enrolledAt?: string;
  atRisk?: boolean;
}

const VIEWS = {
  progress: { title: "Avance de todos los participantes", hint: "De menor a mayor avance, para ver primero a quien más ayuda necesita." },
  risk: { title: "Participantes en riesgo", hint: "Más de 14 días matriculados y menos de 30 % de avance." },
} as const;

/** Detalle de las tarjetas del panel de empresa: quiénes están detrás del número. */
export default async function CompanyDashboardDetailPage({ params, searchParams }: { params: { companyId: string }; searchParams: { kpi?: string } }) {
  const locale = await getLocale();
  const view = searchParams.kpi === "risk" ? "risk" : "progress";
  const accessToken = getServerAccessToken();
  const { data } = await withFallback(() => companyApi.reports(params.companyId, {}, accessToken), { rows: [] as Row[] });
  const all: Row[] = (data as { rows?: Row[] }).rows ?? [];
  const rows = (view === "risk" ? all.filter((r) => r.atRisk) : all.filter((r) => r.status === "ACTIVE" || r.status === "COMPLETED")).sort(
    (a, b) => a.progressPct - b.progressPct,
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <Link href={`/empresa/${params.companyId}`} className="mb-2 inline-flex items-center gap-1 text-sm text-ash-600 hover:text-ink-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver al panel
        </Link>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">{VIEWS[view].title}</h1>
        <p className="mt-1 text-sm text-ash-500">{VIEWS[view].hint}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-ash-500">{view === "risk" ? "Nadie está en riesgo por ahora." : "Todavía no hay matrículas."}</p>
      ) : (
        <ul className="grid gap-3">
          {rows.map((r, i) => (
            <li key={`${r.userId}-${i}`}>
              <Card>
                <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium text-ink-900">{r.userName}{r.team ? <span className="font-normal text-ash-500"> · {r.team}</span> : null}</p>
                    <p className="text-sm text-ash-600">{localize(r.courseTitle, locale)}{r.enrolledAt ? ` · desde ${formatDate(r.enrolledAt, locale)}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-3 sm:w-64">
                    <div className="flex-1"><ProgressBar value={r.progressPct} /></div>
                    <span className="w-12 text-right text-sm tabular-nums">{Math.round(r.progressPct)}%</span>
                    {r.status === "COMPLETED" && <Badge variant="success">Completó</Badge>}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

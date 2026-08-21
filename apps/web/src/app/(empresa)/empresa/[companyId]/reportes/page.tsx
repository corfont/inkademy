import type { Metadata } from "next";
import { getTranslations, getLocale } from "next-intl/server";
import { companyApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { localize } from "@/lib/format";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Callout } from "@/components/ui/Callout";

export const metadata: Metadata = { title: "Reportes" };

interface ReportRow {
  team: string;
  courseTitle: string;
  participants: number;
  averageProgress: number;
  averageAttendance: number;
  averageScore: number;
}

const MOCK_REPORT: ReportRow[] = [
  { team: "Comercial", courseTitle: "Liderazgo de equipos remotos", participants: 22, averageProgress: 64, averageAttendance: 88, averageScore: 81 },
  { team: "RRHH", courseTitle: "Compliance y protección de datos personales", participants: 14, averageProgress: 91, averageAttendance: 95, averageScore: 87 },
  { team: "Operaciones", courseTitle: "Seguridad y salud en el trabajo (SST)", participants: 48, averageProgress: 40, averageAttendance: 72, averageScore: 74 },
];

/**
 * `GET /companies/:id/reports` devuelve `{ total, rows }` con una fila POR
 * MATRÍCULA (ver `CompaniesService.getReports`), no agregada por equipo+curso
 * como necesita esta tabla — se agrega aquí. La API todavía no calcula
 * asistencia para este reporte (solo progreso/nota), por eso esa columna
 * queda en "N/D" con datos reales; el mock sí la simula para no dejar la
 * pantalla de referencia con una columna vacía.
 */
function aggregateReportRows(payload: { rows: any[] } | ReportRow[], locale: string): ReportRow[] {
  const rawRows: any[] = Array.isArray(payload) ? payload : payload.rows ?? [];
  if (rawRows.length > 0 && "averageProgress" in rawRows[0]) return rawRows as ReportRow[];

  const groups = new Map<string, { team: string; courseTitle: string; participants: number; progressSum: number; scoreSum: number; scoreCount: number }>();
  for (const row of rawRows) {
    const courseTitle = localize(row.courseTitle, locale, "Curso");
    const key = `${row.team ?? "Sin equipo"}::${courseTitle}`;
    const group = groups.get(key) ?? { team: row.team ?? "Sin equipo", courseTitle, participants: 0, progressSum: 0, scoreSum: 0, scoreCount: 0 };
    group.participants += 1;
    group.progressSum += row.progressPct ?? 0;
    if (typeof row.bestScore === "number") {
      group.scoreSum += row.bestScore;
      group.scoreCount += 1;
    }
    groups.set(key, group);
  }
  return Array.from(groups.values()).map((g) => ({
    team: g.team,
    courseTitle: g.courseTitle,
    participants: g.participants,
    averageProgress: Math.round(g.progressSum / g.participants),
    averageAttendance: NaN,
    averageScore: g.scoreCount ? Math.round(g.scoreSum / g.scoreCount) : NaN,
  }));
}

export default async function ReportsPage({ params }: { params: { companyId: string } }) {
  const t = await getTranslations("empresa.reports");
  const locale = await getLocale();
  const accessToken = getServerAccessToken();

  const { data: rawReport, live } = await withFallback(
    () => companyApi.reports(params.companyId, {}, accessToken),
    { rows: MOCK_REPORT } as { rows: any[] },
  );
  const rows = aggregateReportRows(rawReport, locale);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">{t("title")}</h1>
      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      <div className="overflow-x-auto rounded-lg border border-paper-border bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-paper-border text-ash-500">
            <tr>
              <th className="p-4 font-medium">Equipo</th>
              <th className="p-4 font-medium">Curso</th>
              <th className="p-4 font-medium">Participantes</th>
              <th className="p-4 font-medium">Avance promedio</th>
              <th className="p-4 font-medium">Asistencia</th>
              <th className="p-4 font-medium">Nota promedio</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-border">
            {rows.map((row: ReportRow, idx: number) => (
              <tr key={idx}>
                <td className="p-4 font-medium text-ink-900">{row.team}</td>
                <td className="p-4 text-ash-600">{row.courseTitle}</td>
                <td className="p-4 text-ash-600">{row.participants}</td>
                <td className="p-4">
                  <ProgressBar value={row.averageProgress} className="max-w-[8rem]" />
                </td>
                <td className="p-4 text-ash-600">{Number.isFinite(row.averageAttendance) ? `${row.averageAttendance}%` : "N/D"}</td>
                <td className="p-4 text-ash-600">{Number.isFinite(row.averageScore) ? row.averageScore : "N/D"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { companyApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { localize, formatDate } from "@/lib/format";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Badge } from "@/components/ui/Badge";
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
 * como necesita esta tabla — se agrega aquí. `attendancePct` es null cuando
 * el curso no tiene sesiones en vivo (p.ej. cursos 100% grabados) — se
 * excluye del promedio en vez de contarlo como 0%.
 */
function aggregateReportRows(payload: { rows: any[] } | ReportRow[], locale: string): ReportRow[] {
  const rawRows: any[] = Array.isArray(payload) ? payload : payload.rows ?? [];
  if (rawRows.length > 0 && "averageProgress" in rawRows[0]) return rawRows as ReportRow[];

  const groups = new Map<
    string,
    { team: string; courseTitle: string; participants: number; progressSum: number; scoreSum: number; scoreCount: number; attendanceSum: number; attendanceCount: number }
  >();
  for (const row of rawRows) {
    const courseTitle = localize(row.courseTitle, locale, "Curso");
    const key = `${row.team ?? "Sin equipo"}::${courseTitle}`;
    const group =
      groups.get(key) ?? { team: row.team ?? "Sin equipo", courseTitle, participants: 0, progressSum: 0, scoreSum: 0, scoreCount: 0, attendanceSum: 0, attendanceCount: 0 };
    group.participants += 1;
    group.progressSum += row.progressPct ?? 0;
    if (typeof row.bestScore === "number") {
      group.scoreSum += row.bestScore;
      group.scoreCount += 1;
    }
    if (typeof row.attendancePct === "number") {
      group.attendanceSum += row.attendancePct;
      group.attendanceCount += 1;
    }
    groups.set(key, group);
  }
  return Array.from(groups.values()).map((g) => ({
    team: g.team,
    courseTitle: g.courseTitle,
    participants: g.participants,
    averageProgress: Math.round(g.progressSum / g.participants),
    averageAttendance: g.attendanceCount ? Math.round(g.attendanceSum / g.attendanceCount) : NaN,
    averageScore: g.scoreCount ? Math.round(g.scoreSum / g.scoreCount) : NaN,
  }));
}

interface StudentDetailRow {
  userName: string;
  team: string;
  courseTitle: string;
  progressPct: number;
  bestScore: number | null;
  attemptsCount: number;
  failedAttemptsCount: number;
  hasSuspiciousAttempt: boolean;
  status: string;
  completedAt: string | null;
}

/**
 * Detalle por alumno (antes esta página solo mostraba promedios por
 * equipo+curso, sin poder responder "¿quién está llevando el curso, quién
 * no, cuántas veces le falló, quién acabó primero?"). `rawRows` viene de
 * `GET /companies/:id/reports` — una fila por matrícula (ver
 * `CompaniesService.getReports`). Se ordena por fecha de finalización (los
 * que ya completaron primero, más reciente arriba dentro de "completados";
 * los que siguen en curso al final) para responder directamente "quién
 * acabó primero".
 */
function extractStudentDetailRows(payload: { rows: any[] } | ReportRow[], locale: string): StudentDetailRow[] {
  const rawRows: any[] = Array.isArray(payload) ? [] : payload.rows ?? [];
  return rawRows
    .map((row) => ({
      userName: row.userName ?? "—",
      team: row.team ?? "Sin equipo",
      courseTitle: localize(row.courseTitle, locale, "Curso"),
      progressPct: row.progressPct ?? 0,
      bestScore: typeof row.bestScore === "number" ? row.bestScore : null,
      attemptsCount: row.attemptsCount ?? 0,
      failedAttemptsCount: row.failedAttemptsCount ?? 0,
      hasSuspiciousAttempt: Boolean(row.hasSuspiciousAttempt),
      status: row.status ?? "ACTIVE",
      completedAt: row.completedAt ?? null,
    }))
    .sort((a, b) => {
      if (a.completedAt && b.completedAt) return new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime();
      if (a.completedAt) return -1;
      if (b.completedAt) return 1;
      return b.progressPct - a.progressPct;
    });
}

const STATUS_LABEL: Record<string, string> = { ACTIVE: "En curso", COMPLETED: "Completado", EXPIRED: "Vencido", CANCELLED: "Cancelado" };

export default async function ReportsPage({ params }: { params: { companyId: string } }) {
  const t = await getTranslations("empresa.reports");
  const locale = await getLocale();
  const accessToken = getServerAccessToken();

  const { data: rawReport, live } = await withFallback(
    () => companyApi.reports(params.companyId, {}, accessToken),
    { rows: MOCK_REPORT } as { rows: any[] },
  );
  const rows = aggregateReportRows(rawReport, locale);
  const studentRows = extractStudentDetailRows(rawReport, locale);

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

      {studentRows.length > 0 && (
        <div>
          <h2 className="mb-1 font-serif text-lg font-semibold text-ink-900">Detalle por colaborador</h2>
          <p className="mb-3 text-sm text-ash-500">
            Ordenado por quién completó primero. Los intentos fallidos y la alerta de "posible trampa" (nota alta con
            un tiempo de resolución muy corto) te ayudan a decidir si vale la pena revisar un caso puntual.
          </p>
          <div className="overflow-x-auto rounded-lg border border-paper-border bg-paper">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-paper-border text-ash-500">
                <tr>
                  <th className="p-3 font-medium">Colaborador</th>
                  <th className="p-3 font-medium">Equipo</th>
                  <th className="p-3 font-medium">Curso</th>
                  <th className="p-3 font-medium">Avance</th>
                  <th className="p-3 font-medium">Nota</th>
                  <th className="p-3 font-medium">Intentos</th>
                  <th className="p-3 font-medium">Estado</th>
                  <th className="p-3 font-medium">Completó</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paper-border">
                {studentRows.map((s, idx) => (
                  <tr key={idx}>
                    <td className="p-3 font-medium text-ink-900">
                      <div className="flex items-center gap-1.5">
                        {s.userName}
                        {s.hasSuspiciousAttempt && (
                          <span title="Nota alta con tiempo de resolución muy corto — posible trampa, revisar">
                            <ShieldAlert className="h-4 w-4 text-danger" aria-hidden="true" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-ash-600">{s.team}</td>
                    <td className="p-3 text-ash-600">{s.courseTitle}</td>
                    <td className="p-3">
                      <ProgressBar value={s.progressPct} className="max-w-[6rem]" />
                    </td>
                    <td className="p-3 text-ash-600">{s.bestScore != null ? s.bestScore.toFixed(1) : "—"}</td>
                    <td className="p-3 text-ash-600">
                      {s.attemptsCount}
                      {s.failedAttemptsCount > 0 && <span className="text-danger"> ({s.failedAttemptsCount} fallido{s.failedAttemptsCount === 1 ? "" : "s"})</span>}
                    </td>
                    <td className="p-3">
                      <Badge variant={s.status === "COMPLETED" ? "success" : s.status === "EXPIRED" || s.status === "CANCELLED" ? "danger" : "outline"}>
                        {STATUS_LABEL[s.status] ?? s.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-ash-600">{s.completedAt ? formatDate(s.completedAt, locale) : "En curso"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

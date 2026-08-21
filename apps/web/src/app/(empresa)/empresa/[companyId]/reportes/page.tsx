import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { companyApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
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

export default async function ReportsPage({ params }: { params: { companyId: string } }) {
  const t = await getTranslations("empresa.reports");

  const { data: rows, live } = await withFallback(() => companyApi.reports(params.companyId), MOCK_REPORT);

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
                <td className="p-4 text-ash-600">{row.averageAttendance}%</td>
                <td className="p-4 text-ash-600">{row.averageScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

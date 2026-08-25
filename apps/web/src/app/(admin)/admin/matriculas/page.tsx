import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ExtendAccessControl } from "@/components/admin/ExtendAccessControl";
import { localize, formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Matrículas (admin)" };

type EnrollmentRow = {
  id: string;
  userName: string;
  userEmail: string;
  offeringTitle: Record<string, string>;
  status: string;
  progressPct: number;
  accessExpiresAt: string | null;
  enrolledAt: string;
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  ACTIVE: "success",
  COMPLETED: "neutral",
  EXPIRED: "danger",
  CANCELLED: "neutral",
};

export default async function AdminEnrollmentsPage({ searchParams }: { searchParams: { q?: string } }) {
  const locale = await getLocale();
  const accessToken = getServerAccessToken();
  const q = searchParams.q?.trim() || undefined;
  const { data: enrollments, live } = await withFallback(() => adminApi.enrollments(q, accessToken), [] as EnrollmentRow[]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Matrículas</h1>
        <p className="mt-1 text-sm text-ash-500">
          Busca por alumno para ampliar el plazo de acceso de un curso grabado con fecha de término — caso especial, uno por uno.
        </p>
      </div>
      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      <form className="flex gap-2" action="/admin/matriculas">
        <Input name="q" defaultValue={q ?? ""} placeholder="Buscar por nombre o correo del alumno…" className="max-w-md" />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-paper-border bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-paper-border text-ash-500">
            <tr>
              <th className="p-4 font-medium">Alumno</th>
              <th className="p-4 font-medium">Curso/Programa</th>
              <th className="p-4 font-medium">Avance</th>
              <th className="p-4 font-medium">Estado</th>
              <th className="p-4 font-medium">Acceso vence</th>
              <th className="p-4 font-medium">Ampliar</th>
            </tr>
          </thead>
          <tbody>
            {enrollments.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-ash-500">
                  {q ? "No se encontraron matrículas para esa búsqueda." : "Busca por nombre o correo para ver matrículas."}
                </td>
              </tr>
            )}
            {enrollments.map((e) => (
              <tr key={e.id} className="border-b border-paper-border last:border-0 hover:bg-paper-muted">
                <td className="p-4">
                  <p className="font-medium text-ink-900">{e.userName}</p>
                  <p className="text-xs text-ash-500">{e.userEmail}</p>
                </td>
                <td className="p-4 text-ash-700">{localize(e.offeringTitle, locale)}</td>
                <td className="p-4 text-ash-600">{Math.round(e.progressPct)}%</td>
                <td className="p-4">
                  <Badge variant={STATUS_VARIANT[e.status] ?? "neutral"}>{e.status}</Badge>
                </td>
                <td className="p-4 text-ash-600">{e.accessExpiresAt ? formatDate(e.accessExpiresAt, locale) : "Abierto (sin vencimiento)"}</td>
                <td className="p-4">
                  <ExtendAccessControl enrollmentId={e.id} accessExpiresAt={e.accessExpiresAt} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { companyApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { Callout } from "@/components/ui/Callout";
import { CertificateDeliverySettingsForm } from "@/components/empresa/CertificateDeliverySettingsForm";
import { formatDate, localize } from "@/lib/format";

export const metadata: Metadata = { title: "Certificados de la empresa" };

interface CompanyCertificateRow {
  id: string;
  holderName: string;
  courseTitle: string;
  issuedAt: string;
  code: string;
}

const MOCK_ROWS: CompanyCertificateRow[] = [
  { id: "cc1", holderName: "Jorge Nina", courseTitle: "Análisis de datos con Power BI", issuedAt: "2026-07-20T00:00:00.000Z", code: "INK-2026-8F3K2" },
  { id: "cc2", holderName: "Valeria Ochoa", courseTitle: "Compliance y protección de datos personales", issuedAt: "2026-06-02T00:00:00.000Z", code: "INK-2026-9A1Z7" },
];

export default async function CompanyCertificatesPage({ params }: { params: { companyId: string } }) {
  const locale = await getLocale();
  const accessToken = getServerAccessToken();

  const { data: rawCertificates, live } = await withFallback(
    () => companyApi.certificates(params.companyId, accessToken),
    MOCK_ROWS.map((r) => ({ id: r.id, holderName: r.holderName, title: r.courseTitle, issuedAt: r.issuedAt, code: r.code })),
  );
  const [{ data: memberships }, { data: settings }] = await Promise.all([
    withFallback(() => companyApi.mine(accessToken), [] as { companyId: string; role: string }[]),
    withFallback(() => companyApi.certificateSettings(params.companyId, accessToken), { certificateDeliveryTarget: "STUDENT" as const }),
  ]);
  const isCompanyAdmin = memberships.some((m) => m.companyId === params.companyId && m.role === "COMPANY_ADMIN");

  const rows: CompanyCertificateRow[] = rawCertificates.map((c: any) => ({
    id: c.id,
    holderName: c.holderName ?? "—",
    courseTitle: typeof c.title === "string" ? c.title : localize(c.title, locale),
    issuedAt: c.issuedAt,
    code: c.code,
  }));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">Certificados emitidos</h1>
      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}
      {isCompanyAdmin && <CertificateDeliverySettingsForm companyId={params.companyId} initialTarget={settings.certificateDeliveryTarget} />}

      {rows.length === 0 ? (
        <p className="text-ash-500">Todavía no se ha emitido ningún certificado a tus colaboradores.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-paper-border bg-paper">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-paper-border text-ash-500">
              <tr>
                <th className="p-4 font-medium">Colaborador</th>
                <th className="p-4 font-medium">Curso</th>
                <th className="p-4 font-medium">Fecha de emisión</th>
                <th className="p-4 font-medium">Verificación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-border">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="p-4 font-medium text-ink-900">{row.holderName}</td>
                  <td className="p-4 text-ash-600">{row.courseTitle}</td>
                  <td className="p-4 text-ash-600">{formatDate(row.issuedAt, locale)}</td>
                  <td className="p-4">
                    <Link href={`/verificar/${row.code}`} className="text-ink-700 hover:underline">
                      {row.code}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

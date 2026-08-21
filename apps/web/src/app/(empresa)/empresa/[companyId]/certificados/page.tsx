import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { Callout } from "@/components/ui/Callout";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Certificados de la empresa" };

// NOTA: docs/API-CONTRACT.md no define todavía un endpoint
// GET /companies/:id/certificates. Esta pantalla queda con datos simulados
// y lista para conectarse cuando ese endpoint exista (se sugiere agregarlo
// al contrato, análogo a /companies/:id/reports).
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

export default async function CompanyCertificatesPage() {
  const t = await getTranslations("empresa.certificates");
  const locale = await getLocale();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">Certificados emitidos</h1>
      <Callout variant="info">Este endpoint aún no está definido en el contrato de API; se muestran datos de referencia.</Callout>

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
            {MOCK_ROWS.map((row) => (
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
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { MOCK_CERTIFICATES } from "@/lib/mock-data";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Certificados (admin)" };

export default async function AdminCertificatesPage() {
  const locale = await getLocale();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Certificados emitidos</h1>
        <Link href="/admin/certificados/plantillas">
          <Button variant="outline">Gestionar plantillas</Button>
        </Link>
      </div>
      <Callout variant="info">
        El listado de certificados emitidos abajo usa datos de referencia — todavía no existe un endpoint
        GET /admin/certificates para buscarlos globalmente en apps/api. Las plantillas (diseño del PDF) sí son reales:
        ver &quot;Gestionar plantillas&quot;.
      </Callout>

      <div className="overflow-x-auto rounded-lg border border-paper-border bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-paper-border text-ash-500">
            <tr>
              <th className="p-4 font-medium">Código</th>
              <th className="p-4 font-medium">Curso</th>
              <th className="p-4 font-medium">Emitido</th>
              <th className="p-4 font-medium">Estado</th>
              <th className="p-4 font-medium">Verificación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-border">
            {MOCK_CERTIFICATES.map((cert) => (
              <tr key={cert.id}>
                <td className="p-4 font-medium text-ink-900">{cert.code}</td>
                <td className="p-4 text-ash-600">{cert.title.es}</td>
                <td className="p-4 text-ash-600">{formatDate(cert.issuedAt, locale)}</td>
                <td className="p-4">
                  <Badge variant="success">Vigente</Badge>
                </td>
                <td className="p-4">
                  <Link href={`/verificar/${cert.code}`} className="text-ink-700 hover:underline">
                    Ver
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

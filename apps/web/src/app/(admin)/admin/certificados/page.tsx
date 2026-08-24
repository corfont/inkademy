import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { certificateApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { MOCK_CERTIFICATES } from "@/lib/mock-data";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { formatDate, localize } from "@/lib/format";

export const metadata: Metadata = { title: "Certificados (admin)" };

function normalizeCertificate(raw: any) {
  return {
    id: raw.id,
    code: raw.code,
    title: raw.title,
    holderName: raw.holderName ?? "—",
    issuedAt: raw.issuedAt,
    revoked: raw.revoked ?? false,
  };
}

export default async function AdminCertificatesPage() {
  const locale = await getLocale();
  const accessToken = getServerAccessToken();

  const { data: rawCertificates, live } = await withFallback(() => certificateApi.listAll(accessToken), MOCK_CERTIFICATES);
  const certificates = rawCertificates.map(normalizeCertificate);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Certificados emitidos</h1>
        <Link href="/admin/certificados/plantillas">
          <Button variant="outline">Gestionar plantillas</Button>
        </Link>
      </div>
      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      {certificates.length === 0 ? (
        <p className="text-ash-500">Todavía no se ha emitido ningún certificado.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-paper-border bg-paper">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-paper-border text-ash-500">
              <tr>
                <th className="p-4 font-medium">Código</th>
                <th className="p-4 font-medium">Titular</th>
                <th className="p-4 font-medium">Curso</th>
                <th className="p-4 font-medium">Emitido</th>
                <th className="p-4 font-medium">Estado</th>
                <th className="p-4 font-medium">Verificación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-border">
              {certificates.map((cert) => (
                <tr key={cert.id}>
                  <td className="p-4 font-medium text-ink-900">{cert.code}</td>
                  <td className="p-4 text-ash-600">{cert.holderName}</td>
                  <td className="p-4 text-ash-600">{typeof cert.title === "string" ? cert.title : localize(cert.title, locale)}</td>
                  <td className="p-4 text-ash-600">{formatDate(cert.issuedAt, locale)}</td>
                  <td className="p-4">
                    <Badge variant={cert.revoked ? "danger" : "success"}>{cert.revoked ? "Revocado" : "Vigente"}</Badge>
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
      )}
    </div>
  );
}

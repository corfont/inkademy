import type { Metadata } from "next";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import { certificateApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { MOCK_CERTIFICATES } from "@/lib/mock-data";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { CertificatesTable } from "@/components/admin/CertificatesTable";

export const metadata: Metadata = { title: "Certificados (admin)" };

function normalizeCertificate(raw: any) {
  return {
    id: raw.id,
    code: raw.code,
    title: raw.title,
    holderName: raw.holderName ?? "—",
    issuedAt: raw.issuedAt,
    revoked: raw.revoked ?? false,
    pdfUrl: raw.pdfUrl ?? null,
    courseId: raw.courseId ?? null,
    companyId: raw.companyId ?? null,
    companyName: raw.companyName ?? null,
  };
}

export default async function AdminCertificatesPage() {
  const locale = await getLocale();
  const accessToken = getServerAccessToken();

  const { data: rawCertificates, live } = await withFallback(() => certificateApi.listAll(accessToken), MOCK_CERTIFICATES);
  const certificates = rawCertificates.map(normalizeCertificate);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink-900">Certificados emitidos</h1>
          <p className="mt-1 text-sm text-ash-500">
            Solo se emiten cuando el alumno cumple las reglas de aprobación del curso (progreso, nota mínima y, si aplica, asistencia).
          </p>
        </div>
        <Link href="/admin/certificados/plantillas">
          <Button variant="outline">Gestionar plantillas</Button>
        </Link>
      </div>
      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      {certificates.length === 0 ? (
        <p className="text-ash-500">Todavía no se ha emitido ningún certificado.</p>
      ) : (
        <CertificatesTable certificates={certificates} locale={locale} />
      )}
    </div>
  );
}

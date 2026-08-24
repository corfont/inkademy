import type { Metadata } from "next";
import { adminApi } from "@/lib/api-client";
import { getServerAccessToken } from "@/lib/server-auth";
import { CertificateTemplateManager } from "@/components/admin/CertificateTemplateManager";

export const metadata: Metadata = { title: "Plantillas de certificado" };

export default async function CertificateTemplatesPage() {
  const accessToken = getServerAccessToken();
  const templates = await adminApi.certificateTemplates(accessToken);
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Plantillas de certificado</h1>
        <p className="mt-1 text-sm text-ash-500">
          Inkademy puede trabajar con una o más plantillas a la vez. Cada curso puede usar la plantilla estándar (la
          más reciente activa que coincida con el idioma del alumno) o una específica — se elige al editar el curso en
          /admin/catalogo.
        </p>
      </div>
      <CertificateTemplateManager templates={templates} />
    </div>
  );
}

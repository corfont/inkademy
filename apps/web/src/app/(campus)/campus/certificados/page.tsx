import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Award, ShieldCheck } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { meApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { MOCK_CERTIFICATES } from "@/lib/mock-data";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { SendCertificateEmailButton } from "@/components/campus/SendCertificateEmailButton";
import { ViewCertificateButton } from "@/components/campus/ViewCertificateButton";
import { localize, formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Certificados" };

export default async function CertificatesPage() {
  const t = await getTranslations("campus.certificates");
  const locale = await getLocale();
  const accessToken = cookies().get(ACCESS_TOKEN_COOKIE)?.value ?? null;

  const { data: certificates, live } = await withFallback(() => meApi.certificates(accessToken), MOCK_CERTIFICATES);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">{t("title")}</h1>
      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      {certificates.length === 0 ? (
        <p className="text-ash-500">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {certificates.map((cert) => (
            <Card key={cert.id}>
              <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <Award className="h-8 w-8 text-gold-500" aria-hidden="true" />
                  <div>
                    <p className="font-serif text-lg font-semibold text-ink-900">{localize(cert.title, locale)}</p>
                    <p className="text-sm text-ash-500">{t("issuedOn", { date: formatDate(cert.issuedAt, locale) })}</p>
                    {cert.finalScore != null && <p className="text-sm text-ash-500">Nota final: {cert.finalScore}</p>}
                    {/* "El usuario debe ver alguna notificación de a quién se le
                        envía el certificado, para que no piense que nunca le va
                        a llegar" — solo aplica a matrículas de empresa; una
                        compra personal (deliveredTo="STUDENT", el default) no
                        necesita ninguna aclaración. La descarga de arriba
                        siempre funciona sin importar esto. */}
                    {cert.deliveredTo === "COMPANY_ADMIN" && (
                      <p className="mt-1 text-xs text-ash-500">
                        Tu correo de aviso se envió al administrador de tu empresa — puedes descargarlo aquí de todas formas.
                      </p>
                    )}
                    {cert.deliveredTo === "BOTH" && (
                      <p className="mt-1 text-xs text-ash-500">Tu correo de aviso se envió a ti y al administrador de tu empresa.</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {cert.pdfUrl && <ViewCertificateButton certificateId={cert.id} label={t("download")} />}
                  <Link href={cert.verificationUrl}>
                    <Button size="sm" variant="ghost">
                      <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      {t("verify")}
                    </Button>
                  </Link>
                  {cert.pdfUrl && <SendCertificateEmailButton certificateId={cert.id} />}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

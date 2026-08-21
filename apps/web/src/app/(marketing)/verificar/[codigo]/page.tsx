import type { Metadata } from "next";
import { CheckCircle2, XCircle, ShieldAlert } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { certificateApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { MOCK_CERTIFICATES } from "@/lib/mock-data";
import { formatDate, localize } from "@/lib/format";

export const metadata: Metadata = { title: "Verificar certificado" };

export default async function VerifyCertificatePage({ params }: { params: { codigo: string } }) {
  const t = await getTranslations("verify");
  const locale = await getLocale();

  const matchingMock = MOCK_CERTIFICATES.find((c) => c.code === params.codigo);
  const fallback = matchingMock
    ? { valid: true, revoked: false, holderName: "Alumno de ejemplo", courseTitle: localize(matchingMock.title, locale), issuedAt: matchingMock.issuedAt }
    : { valid: false, revoked: false };

  const { data: result } = await withFallback(() => certificateApi.verify(params.codigo), fallback as any);

  return (
    <div className="container flex min-h-[60vh] items-center justify-center py-16">
      <div className="w-full max-w-lg rounded-lg border border-paper-border bg-paper p-8 text-center shadow-card">
        <h1 className="font-serif text-2xl font-semibold text-ink-900">{t("title")}</h1>
        <p className="mt-2 text-sm text-ash-600">{t("subtitle")}</p>

        <div className="mt-8 rounded-md border border-paper-border p-6">
          {result.revoked ? (
            <div className="flex flex-col items-center gap-2 text-danger">
              <ShieldAlert className="h-10 w-10" aria-hidden="true" />
              <p className="font-medium">{t("revoked")}</p>
            </div>
          ) : result.valid ? (
            <div className="flex flex-col items-center gap-2 text-success">
              <CheckCircle2 className="h-10 w-10" aria-hidden="true" />
              <p className="font-medium">{t("valid")}</p>
              <dl className="mt-4 w-full space-y-2 text-left text-sm text-ash-700">
                <div className="flex justify-between border-b border-paper-border pb-2">
                  <dt className="font-medium">{t("holder")}</dt>
                  <dd>{result.holderName}</dd>
                </div>
                <div className="flex justify-between border-b border-paper-border pb-2">
                  <dt className="font-medium">{t("course")}</dt>
                  <dd>{result.courseTitle}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="font-medium">{t("issuedOn")}</dt>
                  <dd>{result.issuedAt ? formatDate(result.issuedAt, locale) : "—"}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-ash-500">
              <XCircle className="h-10 w-10" aria-hidden="true" />
              <p className="font-medium">{t("invalid")}</p>
            </div>
          )}
        </div>

        <p className="mt-6 text-xs text-ash-400">
          {t("codeLabel")}: <code>{params.codigo}</code>
        </p>
      </div>
    </div>
  );
}

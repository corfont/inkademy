import type { Metadata } from "next";
import { getTranslations, getLocale } from "next-intl/server";
import { companyApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Cotizaciones" };

interface QuoteLike {
  id: string;
  offeringDescription: string;
  status: "REQUESTED" | "SENT" | "ACCEPTED" | "REJECTED";
  createdAt: string;
}

const MOCK_QUOTES: QuoteLike[] = [
  { id: "q1", offeringDescription: "Programa de liderazgo para 60 supervisores de planta", status: "SENT", createdAt: "2026-08-10T00:00:00.000Z" },
  { id: "q2", offeringDescription: "Diplomado de gestión financiera para gerencia media", status: "REQUESTED", createdAt: "2026-08-18T00:00:00.000Z" },
];

const STATUS_VARIANT: Record<QuoteLike["status"], "neutral" | "warning" | "success" | "danger"> = {
  REQUESTED: "warning",
  SENT: "neutral",
  ACCEPTED: "success",
  REJECTED: "danger",
};

export default async function QuotesPage({ params }: { params: { companyId: string } }) {
  const t = await getTranslations("empresa.quotes");
  const locale = await getLocale();
  const accessToken = getServerAccessToken();

  const { data: quotes, live } = await withFallback(() => companyApi.quotes(params.companyId, accessToken), MOCK_QUOTES);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">{t("title")}</h1>
      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      <div className="flex flex-col gap-3">
        {quotes.map((quote: QuoteLike) => (
          <div key={quote.id} className="flex items-center justify-between gap-4 rounded-lg border border-paper-border bg-paper p-5">
            <div>
              <p className="font-medium text-ink-900">{quote.offeringDescription}</p>
              <p className="text-sm text-ash-500">{t("requestedOn", { date: formatDate(quote.createdAt, locale) })}</p>
            </div>
            <Badge variant={STATUS_VARIANT[quote.status]}>{quote.status}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import { getTranslations, getLocale } from "next-intl/server";
import { companyApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { formatDate } from "@/lib/format";
import { Callout } from "@/components/ui/Callout";
import { QuoteResponseCard } from "@/components/empresa/QuoteResponseCard";

export const metadata: Metadata = { title: "Cotizaciones" };

interface QuoteLike {
  id: string;
  offeringDescription: string;
  status: "REQUESTED" | "SENT" | "ACCEPTED" | "REJECTED";
  createdAt: string;
  amount?: number | null;
  currency?: string | null;
  validUntil?: string | null;
  seatsQuoted?: number | null;
}

const MOCK_QUOTES: QuoteLike[] = [
  { id: "q1", offeringDescription: "Programa de liderazgo para 60 supervisores de planta", status: "SENT", createdAt: "2026-08-10T00:00:00.000Z", amount: 45000, currency: "PEN", seatsQuoted: 60 },
  { id: "q2", offeringDescription: "Diplomado de gestión financiera para gerencia media", status: "REQUESTED", createdAt: "2026-08-18T00:00:00.000Z" },
];

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
          <QuoteResponseCard
            key={quote.id}
            quote={quote}
            companyId={params.companyId}
            locale={locale}
            requestedOnLabel={t("requestedOn", { date: formatDate(quote.createdAt, locale) })}
          />
        ))}
      </div>
    </div>
  );
}

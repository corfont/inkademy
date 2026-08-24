import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { supportApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { MOCK_SUPPORT_TICKETS } from "@/lib/mock-data";
import { NewTicketForm } from "@/components/campus/NewTicketForm";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Soporte" };

const PRIORITY_VARIANT: Record<string, "danger" | "warning" | "neutral"> = {
  URGENT: "danger",
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "neutral",
};

export default async function SupportPage() {
  const t = await getTranslations("campus.support");
  const locale = await getLocale();

  const accessToken = getServerAccessToken();
  const { data: tickets, live } = await withFallback(() => supportApi.tickets({}, accessToken), MOCK_SUPPORT_TICKETS);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-ink-900">{t("title")}</h1>
        <NewTicketForm />
      </div>

      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      {tickets.length === 0 ? (
        <p className="text-ash-500">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {tickets.map((ticket) => (
            <Link key={ticket.id} href={`/campus/soporte/${ticket.id}`}>
              <Card className="transition-shadow hover:shadow-raised">
                <CardContent className="flex items-center justify-between gap-4 p-5">
                  <div>
                    <p className="font-medium text-ink-900">{ticket.subject}</p>
                    <p className="text-sm text-ash-500">
                      {ticket.category} · {formatDate(ticket.createdAt, locale)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant={PRIORITY_VARIANT[ticket.priority]}>{ticket.priority}</Badge>
                    <Badge variant="outline">{ticket.status}</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

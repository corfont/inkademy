import type { Metadata } from "next";
import { getTranslations, getLocale } from "next-intl/server";
import { supportApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { MOCK_SUPPORT_TICKETS } from "@/lib/mock-data";
import { SupportTicketList } from "@/components/support/SupportTicketList";

export const metadata: Metadata = { title: "Soporte" };

export default async function SupportPage() {
  const t = await getTranslations("campus.support");
  const locale = await getLocale();

  const accessToken = getServerAccessToken();
  const { data: tickets, live } = await withFallback(() => supportApi.tickets({}, accessToken), MOCK_SUPPORT_TICKETS);

  return <SupportTicketList title={t("title")} tickets={tickets} locale={locale} live={live} emptyLabel={t("empty")} basePath="/campus/soporte" />;
}

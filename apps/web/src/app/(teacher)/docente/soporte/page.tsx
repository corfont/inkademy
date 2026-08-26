import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { supportApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { MOCK_SUPPORT_TICKETS } from "@/lib/mock-data";
import { SupportTicketList } from "@/components/support/SupportTicketList";

export const metadata: Metadata = { title: "Soporte (docente)" };

/** "El docente también podría tener inconvenientes en la plataforma y debería tener su opción de ayuda y reporte de tickets" — reusa el mismo módulo de soporte que /campus/soporte. */
export default async function TeacherSupportPage() {
  const locale = await getLocale();
  const accessToken = getServerAccessToken();
  const { data: tickets, live } = await withFallback(() => supportApi.tickets({}, accessToken), MOCK_SUPPORT_TICKETS);

  return (
    <SupportTicketList
      title="Soporte"
      tickets={tickets}
      locale={locale}
      live={live}
      emptyLabel="No tienes tickets de soporte todavía."
      basePath="/docente/soporte"
    />
  );
}

import type { Metadata } from "next";
import { supportApi } from "@/lib/api-client";
import { getServerAccessToken } from "@/lib/server-auth";
import { TicketThread } from "@/components/support/TicketThread";

export const metadata: Metadata = { title: "Ticket de soporte" };

export default async function TeacherTicketDetailPage({ params }: { params: { id: string } }) {
  const accessToken = getServerAccessToken();
  const ticket = await supportApi.ticket(params.id, accessToken);
  return <TicketThread ticket={ticket} backHref="/docente/soporte" />;
}

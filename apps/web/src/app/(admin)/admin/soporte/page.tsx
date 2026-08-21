import type { Metadata } from "next";
import { supportApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { MOCK_SUPPORT_TICKETS } from "@/lib/mock-data";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { formatDate } from "@/lib/format";
import { getLocale } from "next-intl/server";

export const metadata: Metadata = { title: "Soporte (admin)" };

const PRIORITY_VARIANT: Record<string, "danger" | "warning" | "neutral"> = {
  URGENT: "danger",
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "neutral",
};

export default async function AdminSupportPage() {
  const locale = await getLocale();
  const { data: tickets, live } = await withFallback(() => supportApi.tickets(), MOCK_SUPPORT_TICKETS);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">Todos los tickets</h1>
      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      <div className="overflow-x-auto rounded-lg border border-paper-border bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-paper-border text-ash-500">
            <tr>
              <th className="p-4 font-medium">Asunto</th>
              <th className="p-4 font-medium">Categoría</th>
              <th className="p-4 font-medium">Fecha</th>
              <th className="p-4 font-medium">Prioridad</th>
              <th className="p-4 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-border">
            {tickets.map((ticket) => (
              <tr key={ticket.id}>
                <td className="p-4 font-medium text-ink-900">{ticket.subject}</td>
                <td className="p-4 text-ash-600">{ticket.category}</td>
                <td className="p-4 text-ash-600">{formatDate(ticket.createdAt, locale)}</td>
                <td className="p-4">
                  <Badge variant={PRIORITY_VARIANT[ticket.priority]}>{ticket.priority}</Badge>
                </td>
                <td className="p-4">
                  <Badge variant="outline">{ticket.status}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

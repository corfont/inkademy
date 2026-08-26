import Link from "next/link";
import { NewTicketForm } from "@/components/campus/NewTicketForm";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { formatDate } from "@/lib/format";

const PRIORITY_VARIANT: Record<string, "danger" | "warning" | "neutral"> = {
  URGENT: "danger",
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "neutral",
};

/**
 * "El docente también podría tener inconvenientes en la plataforma y
 * debería tener su opción de ayuda y reporte de tickets" — el módulo de
 * soporte (SupportTicketController/service) nunca asumió que el creador
 * fuera STUDENT, así que se reusa tal cual para /docente/soporte; lo único
 * que cambiaba entre /campus/soporte y esta versión era el título y el
 * prefijo de las rutas, ahora parametrizado en `basePath`.
 */
export function SupportTicketList({
  title,
  tickets,
  locale,
  live,
  emptyLabel,
  basePath,
}: {
  title: string;
  tickets: any[];
  locale: string;
  live: boolean;
  emptyLabel: string;
  basePath: string;
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-ink-900">{title}</h1>
        <NewTicketForm />
      </div>

      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      {tickets.length === 0 ? (
        <p className="text-ash-500">{emptyLabel}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {tickets.map((ticket) => (
            <Link key={ticket.id} href={`${basePath}/${ticket.id}`}>
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

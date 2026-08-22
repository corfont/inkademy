import type { Metadata } from "next";
import { cookies } from "next/headers";
import { CalendarDays, Radio } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { meApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth";
import { AddToCalendarButton } from "@/components/campus/AddToCalendarButton";
import { JoinClassButton } from "@/components/campus/JoinClassButton";
import { Card, CardContent } from "@/components/ui/Card";
import { Callout } from "@/components/ui/Callout";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Agenda" };

interface CalendarEventLike {
  id: string;
  type: string;
  title: string;
  startsAt: string;
  liveSessionId?: string | null;
}

const MOCK_EVENTS: CalendarEventLike[] = [
  { id: "ev1", type: "LIVE_CLASS", title: "Liderazgo de equipos remotos — Sesión en vivo", startsAt: "2026-09-08T23:00:00.000Z", liveSessionId: "c1-live1" },
  { id: "ev2", type: "EXAM", title: "Evaluación final: Análisis de datos con Power BI", startsAt: "2026-08-25T20:00:00.000Z" },
  { id: "ev3", type: "ACCESS_EXPIRATION", title: "Vence tu acceso al Diplomado en Gestión Financiera", startsAt: "2027-01-15T00:00:00.000Z" },
];

export default async function AgendaPage() {
  const t = await getTranslations("campus.agenda");
  const locale = await getLocale();
  const accessToken = cookies().get(ACCESS_TOKEN_COOKIE)?.value ?? null;

  const { data: events, live } = await withFallback(() => meApi.calendar(undefined, undefined, accessToken), MOCK_EVENTS);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-serif text-2xl font-semibold text-ink-900">{t("title")}</h1>
        <AddToCalendarButton />
      </div>

      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      {events.length === 0 ? (
        <p className="text-ash-500">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {events
            .sort((a: CalendarEventLike, b: CalendarEventLike) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
            .map((event: CalendarEventLike) => (
              <Card key={event.id}>
                <CardContent className="flex items-center justify-between gap-4 p-5">
                  <div className="flex items-center gap-3">
                    {event.type === "LIVE_CLASS" ? (
                      <Radio className="h-5 w-5 text-ink-700" aria-hidden="true" />
                    ) : (
                      <CalendarDays className="h-5 w-5 text-ink-700" aria-hidden="true" />
                    )}
                    <div>
                      <p className="font-medium text-ink-900">{event.title}</p>
                      <p className="text-sm text-ash-500">{formatDateTime(event.startsAt, locale)}</p>
                    </div>
                  </div>
                  {event.liveSessionId && <JoinClassButton liveSessionId={event.liveSessionId} />}
                </CardContent>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}

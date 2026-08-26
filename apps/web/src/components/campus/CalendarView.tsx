"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, List, LayoutGrid, Radio } from "lucide-react";
import { JoinClassButton } from "@/components/campus/JoinClassButton";
import { Card, CardContent } from "@/components/ui/Card";
import { formatDateTime } from "@/lib/format";

export interface CalendarEventLike {
  id: string;
  type: string;
  title: string;
  startsAt: string;
  liveSessionId?: string | null;
  enrollmentId?: string | null;
}

// "Si le doy clic a un curso agendado o actividad me debería derivar ya sea
// al curso o al Teams" — clic en el título/ícono lleva a la ficha del curso
// (si el evento tiene enrollmentId); el botón "Unirme" (para LIVE_CLASS)
// sigue aparte para ir directo a Teams, sin anidar un <button> dentro de un
// <a> (mismo criterio que ya usa CourseCard con título y CTA separados).
function EventTitle({ event, children }: { event: CalendarEventLike; children: React.ReactNode }) {
  if (!event.enrollmentId) return <>{children}</>;
  return (
    <Link href={`/campus/cursos/${event.enrollmentId}`} className="hover:underline">
      {children}
    </Link>
  );
}

const WEEKDAY_LABELS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const WEEKDAY_LABELS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_LABELS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const MONTH_LABELS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Antes /campus/agenda (y cualquier futura agenda de docente/admin — es el
 * mismo GET /me/calendar para cualquier rol) era solo una lista plana. Este
 * componente agrega una vista de calendario mensual real, con un toggle
 * para volver a la lista cuando se prefiera el detalle cronológico.
 */
export function CalendarView({ events, locale }: { events: CalendarEventLike[]; locale: string }) {
  const [view, setView] = useState<"month" | "list">("month");
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const weekdayLabels = locale === "en" ? WEEKDAY_LABELS_EN : WEEKDAY_LABELS_ES;
  const monthLabels = locale === "en" ? MONTH_LABELS_EN : MONTH_LABELS_ES;

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEventLike[]>();
    for (const ev of events) {
      const key = dayKey(new Date(ev.startsAt));
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [events],
  );

  const gridDays = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    // Lunes=0 ... Domingo=6 (a diferencia de getDay() que usa Domingo=0).
    const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const days: { date: Date; inMonth: boolean }[] = [];
    for (let i = firstWeekday; i > 0; i--) {
      days.push({ date: new Date(year, month, 1 - i), inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ date: new Date(year, month, d), inMonth: true });
    }
    while (days.length % 7 !== 0) {
      const last = days[days.length - 1].date;
      days.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false });
    }
    return days;
  }, [cursor]);

  const todayKey = dayKey(new Date());
  const selectedEvents = selectedDay ? eventsByDay.get(selectedDay) ?? [] : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end gap-1 rounded-md border border-paper-border bg-paper p-1 self-start">
        <button
          type="button"
          onClick={() => setView("month")}
          className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm ${view === "month" ? "bg-ink-700 text-paper" : "text-ash-600 hover:bg-paper-muted"}`}
        >
          <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
          {locale === "en" ? "Calendar" : "Calendario"}
        </button>
        <button
          type="button"
          onClick={() => setView("list")}
          className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm ${view === "list" ? "bg-ink-700 text-paper" : "text-ash-600 hover:bg-paper-muted"}`}
        >
          <List className="h-3.5 w-3.5" aria-hidden="true" />
          {locale === "en" ? "List" : "Lista"}
        </button>
      </div>

      {view === "month" ? (
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <button
                type="button"
                aria-label={locale === "en" ? "Previous month" : "Mes anterior"}
                onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
                className="rounded-md p-1.5 text-ash-600 hover:bg-paper-muted"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <p className="font-serif text-lg font-semibold text-ink-900">
                {monthLabels[cursor.getMonth()]} {cursor.getFullYear()}
              </p>
              <button
                type="button"
                aria-label={locale === "en" ? "Next month" : "Mes siguiente"}
                onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
                className="rounded-md p-1.5 text-ash-600 hover:bg-paper-muted"
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-ash-500">
              {weekdayLabels.map((w) => (
                <div key={w} className="py-1">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {gridDays.map(({ date, inMonth }) => {
                const key = dayKey(date);
                const dayEvents = eventsByDay.get(key) ?? [];
                const isToday = key === todayKey;
                const isSelected = key === selectedDay;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDay(dayEvents.length ? key : null)}
                    className={`flex min-h-[3.5rem] flex-col items-start gap-0.5 rounded-md border p-1.5 text-left text-xs transition-colors sm:min-h-[4.5rem] ${
                      inMonth ? "bg-paper" : "bg-paper-muted/40 text-ash-400"
                    } ${isSelected ? "border-ink-700 ring-1 ring-ink-700" : "border-paper-border"} ${
                      dayEvents.length ? "cursor-pointer hover:border-ink-400" : "cursor-default"
                    }`}
                  >
                    <span className={`font-medium ${isToday ? "flex h-5 w-5 items-center justify-center rounded-full bg-ink-700 text-paper" : ""}`}>
                      {date.getDate()}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      {dayEvents.slice(0, 2).map((ev) => (
                        <span
                          key={ev.id}
                          className={`truncate rounded-sm px-1 py-0.5 text-[0.65rem] leading-tight ${
                            ev.type === "LIVE_CLASS" ? "bg-ink-50 text-ink-700" : "bg-gold-50 text-gold-700"
                          }`}
                        >
                          {ev.title}
                        </span>
                      ))}
                      {dayEvents.length > 2 && <span className="text-[0.65rem] text-ash-500">+{dayEvents.length - 2} más</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedEvents.length > 0 && (
              <div className="mt-4 flex flex-col gap-2 border-t border-paper-border pt-4">
                {selectedEvents.map((ev) => (
                  <div key={ev.id} className="flex items-center justify-between gap-3 rounded-md bg-paper-muted p-3 text-sm">
                    <div className="flex items-center gap-2">
                      {ev.type === "LIVE_CLASS" ? (
                        <Radio className="h-4 w-4 text-ink-700" aria-hidden="true" />
                      ) : (
                        <CalendarDays className="h-4 w-4 text-ink-700" aria-hidden="true" />
                      )}
                      <div>
                        <p className="font-medium text-ink-900">
                          <EventTitle event={ev}>{ev.title}</EventTitle>
                        </p>
                        <p className="text-xs text-ash-500">{formatDateTime(ev.startsAt, locale)}</p>
                      </div>
                    </div>
                    {ev.liveSessionId && <JoinClassButton liveSessionId={ev.liveSessionId} />}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {sortedEvents.map((event) => (
            <Card key={event.id}>
              <CardContent className="flex items-center justify-between gap-4 p-5">
                <div className="flex items-center gap-3">
                  {event.type === "LIVE_CLASS" ? (
                    <Radio className="h-5 w-5 text-ink-700" aria-hidden="true" />
                  ) : (
                    <CalendarDays className="h-5 w-5 text-ink-700" aria-hidden="true" />
                  )}
                  <div>
                    <p className="font-medium text-ink-900">
                      <EventTitle event={event}>{event.title}</EventTitle>
                    </p>
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

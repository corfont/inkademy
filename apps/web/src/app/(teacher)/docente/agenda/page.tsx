import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { CalendarView } from "@/components/campus/CalendarView";
import { Callout } from "@/components/ui/Callout";

export const metadata: Metadata = { title: "Agenda (docente)" };

/**
 * "El docente también tiene que tener una agenda interactiva para saber
 * cuándo tiene que dictar y a qué hora y cuál es el link" — antes el nav
 * de /docente apuntaba a /campus/agenda (la agenda del ALUMNO, alimentada
 * por CalendarEvent, que nunca se llena para sesiones que el docente
 * dicta) — quedaba vacía o irrelevante. Esta reusa el mismo CalendarView,
 * alimentada por /admin/my-agenda (todas las sesiones de sus cursos
 * asignados).
 */
export default async function TeacherAgendaPage() {
  const locale = await getLocale();
  const accessToken = getServerAccessToken();
  const { data: events, live } = await withFallback(() => adminApi.teacherAgenda(accessToken), []);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">Agenda</h1>
      {!live && <Callout variant="info">No pudimos conectar con la API — no se muestran datos reales por ahora.</Callout>}
      {events.length === 0 ? (
        <p className="text-ash-500">No tienes sesiones en vivo programadas en tus cursos asignados.</p>
      ) : (
        <CalendarView events={events} locale={locale} />
      )}
    </div>
  );
}

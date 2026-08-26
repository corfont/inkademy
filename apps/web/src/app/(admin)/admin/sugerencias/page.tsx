import type { Metadata } from "next";
import { suggestionsApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { getLocale } from "next-intl/server";
import { Callout } from "@/components/ui/Callout";
import { SuggestionStatusControl } from "@/components/admin/SuggestionStatusControl";
import { SuggestionReplyPanel } from "@/components/admin/SuggestionReplyPanel";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Sugerencias" };

// "No sé para qué sirve el estado ni cómo sacarle utilidad" — agrupar la
// lista POR estado (en vez de un dropdown suelto por fila sin ningún
// efecto visible en el orden) es lo que le da utilidad real: de un
// vistazo se ve cuántas siguen sin triage (Nueva) vs. cuántas ya están en
// el roadmap (Planificada). Cambiar el estado a Planificada/Descartada
// además dispara un correo automático al usuario (ver SuggestionsService.updateStatus).
const STATUS_ORDER = ["NEW", "REVIEWED", "PLANNED", "DECLINED"] as const;
const STATUS_SECTION_LABEL: Record<string, string> = {
  NEW: "Nuevas — sin revisar todavía",
  REVIEWED: "Revisadas",
  PLANNED: "Planificadas — se van a implementar",
  DECLINED: "Descartadas",
};

function authorName(raw: any) {
  const user = raw.user;
  return user?.displayName ?? [user?.firstName, user?.lastName].filter(Boolean).join(" ") ?? user?.email ?? "—";
}

export default async function AdminSuggestionsPage() {
  const accessToken = getServerAccessToken();
  const locale = await getLocale();
  const { data: suggestions, live } = await withFallback(() => suggestionsApi.all(accessToken), []);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Sugerencias de usuarios</h1>
        <p className="mt-1 text-sm text-ash-500">Ideas de curso y mejoras que dejaron alumnos y colaboradores.</p>
      </div>
      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      {suggestions.length === 0 ? (
        <p className="text-ash-500">Todavía no hay sugerencias.</p>
      ) : (
        <div className="flex flex-col gap-8">
          {STATUS_ORDER.map((status) => {
            const rows = suggestions.filter((s: any) => s.status === status);
            if (rows.length === 0) return null;
            return (
              <div key={status}>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ash-500">
                  {STATUS_SECTION_LABEL[status]} ({rows.length})
                </h2>
                <ul className="flex flex-col gap-3">
                  {rows.map((s: any) => (
                    <li key={s.id} className="flex flex-col gap-3 rounded-lg border border-paper-border bg-paper p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <p className="text-sm text-ink-900">{s.message}</p>
                          <p className="mt-1 text-xs text-ash-500">
                            {authorName(s)} · {formatDateTime(s.createdAt, locale)}
                          </p>
                          {s.adminResponse && (
                            <p className="mt-2 rounded-md bg-ink-50 p-2 text-xs text-ink-700">
                              <span className="font-semibold">Respuesta enviada: </span>
                              {s.adminResponse}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-none flex-col items-end gap-2">
                          <SuggestionStatusControl id={s.id} status={s.status} />
                          <SuggestionReplyPanel id={s.id} adminResponse={s.adminResponse ?? null} respondedAt={s.respondedAt ?? null} locale={locale} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

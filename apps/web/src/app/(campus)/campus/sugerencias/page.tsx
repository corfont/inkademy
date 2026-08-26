import type { Metadata } from "next";
import { suggestionsApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { Callout } from "@/components/ui/Callout";
import { Badge } from "@/components/ui/Badge";
import { SuggestionForm } from "@/components/campus/SuggestionForm";
import { formatDateTime } from "@/lib/format";
import { getLocale } from "next-intl/server";

export const metadata: Metadata = { title: "Sugerencias" };

// Mismas etiquetas/colores que usa el admin en SuggestionStatusControl —
// para que el alumno entienda en qué va su sugerencia sin tener que
// preguntar: Nueva (todavía sin revisar), Revisada (el equipo ya la vio,
// puede que con respuesta), Planificada (se va a hacer), Descartada.
const STATUS_LABEL: Record<string, string> = { NEW: "Nueva", REVIEWED: "Revisada", PLANNED: "Planificada", DECLINED: "Descartada" };
const STATUS_VARIANT: Record<string, "outline" | "warning" | "success" | "danger"> = {
  NEW: "outline",
  REVIEWED: "warning",
  PLANNED: "success",
  DECLINED: "danger",
};

export default async function SuggestionsPage() {
  const accessToken = getServerAccessToken();
  const locale = await getLocale();
  const { data: suggestions, live } = await withFallback(() => suggestionsApi.mine(accessToken), []);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Sugerencias</h1>
        <p className="mt-1 text-sm text-ash-500">
          ¿Te gustaría que dictemos un curso específico, o tienes una idea para mejorar la plataforma? Cuéntanos.
        </p>
      </div>
      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      <SuggestionForm />

      {suggestions.length > 0 && (
        <div>
          <h2 className="mb-3 font-serif text-lg font-semibold text-ink-900">Tus sugerencias enviadas</h2>
          <ul className="flex flex-col gap-3">
            {suggestions.map((s: any) => (
              <li key={s.id} className="rounded-lg border border-paper-border bg-paper p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-ash-700">{s.message}</p>
                  <Badge variant={STATUS_VARIANT[s.status] ?? "outline"}>{STATUS_LABEL[s.status] ?? s.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-ash-400">{formatDateTime(s.createdAt, locale)}</p>
                {s.adminResponse && (
                  <div className="mt-3 rounded-md bg-ink-50 p-3 text-sm text-ink-800">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-500">Respuesta de Inkademy</p>
                    <p>{s.adminResponse}</p>
                    {s.respondedAt && <p className="mt-1 text-xs text-ash-400">{formatDateTime(s.respondedAt, locale)}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

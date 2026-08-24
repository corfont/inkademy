import type { Metadata } from "next";
import { suggestionsApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { Callout } from "@/components/ui/Callout";
import { SuggestionForm } from "@/components/campus/SuggestionForm";
import { formatDateTime } from "@/lib/format";
import { getLocale } from "next-intl/server";

export const metadata: Metadata = { title: "Sugerencias" };

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
                <p className="text-sm text-ash-700">{s.message}</p>
                <p className="mt-1 text-xs text-ash-400">{formatDateTime(s.createdAt, locale)}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

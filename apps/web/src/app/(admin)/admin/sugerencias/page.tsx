import type { Metadata } from "next";
import { suggestionsApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { getLocale } from "next-intl/server";
import { Callout } from "@/components/ui/Callout";
import { SuggestionStatusControl } from "@/components/admin/SuggestionStatusControl";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Sugerencias" };

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
        <ul className="flex flex-col gap-3">
          {suggestions.map((s: any) => (
            <li key={s.id} className="flex items-start justify-between gap-4 rounded-lg border border-paper-border bg-paper p-4">
              <div className="flex-1">
                <p className="text-sm text-ink-900">{s.message}</p>
                <p className="mt-1 text-xs text-ash-500">
                  {authorName(s)} · {formatDateTime(s.createdAt, locale)}
                </p>
              </div>
              <SuggestionStatusControl id={s.id} status={s.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

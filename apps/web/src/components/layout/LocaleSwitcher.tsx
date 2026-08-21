"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, SUPPORTED_LOCALES } from "@/i18n/request";
import { cn } from "@/lib/cn";

const LABELS: Record<string, string> = { es: "ES", en: "EN" };

export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();

  function setLocale(next: string) {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}`;
    router.refresh();
  }

  return (
    <div className={cn("flex items-center gap-1 rounded-md border border-paper-border p-0.5", className)} role="group" aria-label="Idioma">
      {SUPPORTED_LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed={locale === code}
          onClick={() => setLocale(code)}
          className={cn(
            "rounded-sm px-2 py-1 text-xs font-semibold transition-colors",
            locale === code ? "bg-ink-700 text-paper" : "text-ash-500 hover:text-ash-800",
          )}
        >
          {LABELS[code]}
        </button>
      ))}
    </div>
  );
}

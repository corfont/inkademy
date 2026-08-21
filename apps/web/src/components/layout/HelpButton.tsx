"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { LifeBuoy, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/cn";

export function HelpButton() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const t = useTranslations("help");

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (open && panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={panelRef} className="fixed bottom-5 right-5 z-40 print:hidden">
      {open && (
        <div
          role="dialog"
          aria-label={t("title")}
          className="absolute bottom-16 right-0 w-72 animate-slide-up rounded-lg border border-paper-border bg-paper p-4 shadow-raised"
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="font-serif text-base font-semibold text-ink-900">{t("title")}</p>
            <button aria-label={t("close")} onClick={() => setOpen(false)} className="text-ash-500 hover:text-ash-800">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mb-3 text-sm text-ash-600">{t("description")}</p>
          <div className="flex flex-col gap-2 text-sm">
            <Link href="/ayuda" className="rounded-md px-3 py-2 text-ink-700 hover:bg-paper-muted" onClick={() => setOpen(false)}>
              {t("faqLink")}
            </Link>
            <Link href="/campus/soporte" className="rounded-md px-3 py-2 text-ink-700 hover:bg-paper-muted" onClick={() => setOpen(false)}>
              {t("ticketLink")}
            </Link>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t("open")}
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-full bg-ink-800 text-paper shadow-raised transition-transform hover:scale-105",
        )}
      >
        <LifeBuoy className="h-6 w-6" aria-hidden="true" />
      </button>
    </div>
  );
}

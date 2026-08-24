"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, MonitorSmartphone } from "lucide-react";
import { cn } from "@/lib/cn";
import { THEME_STORAGE_KEY } from "@/lib/theme";

type ThemeChoice = "light" | "dark" | "system";

/**
 * Antes el modo oscuro solo existía atado a `prefers-color-scheme` del SO
 * (ver globals.css) — no había forma de forzar claro/oscuro sin cambiar la
 * configuración del sistema operativo. Este selector escribe
 * `data-theme="light"|"dark"` en <html> (o lo quita para "automático") y lo
 * persiste en localStorage. El script inline en layout.tsx aplica el valor
 * guardado ANTES del primer paint para evitar el parpadeo del tema por
 * defecto.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<ThemeChoice>("system");

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY) as ThemeChoice | null;
    setTheme(stored ?? "system");
  }, []);

  function apply(next: ThemeChoice) {
    setTheme(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    if (next === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", next);
    }
  }

  const options: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Claro", icon: Sun },
    { value: "dark", label: "Oscuro", icon: Moon },
    { value: "system", label: "Automático", icon: MonitorSmartphone },
  ];

  return (
    <div className={cn("inline-flex items-center gap-0.5 rounded-md border border-paper-border bg-paper p-0.5", className)} role="group" aria-label="Tema">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => apply(opt.value)}
          aria-pressed={theme === opt.value}
          title={opt.label}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded",
            theme === opt.value ? "bg-ink-700 text-paper" : "text-ash-500 hover:bg-paper-muted",
          )}
        >
          <opt.icon className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}

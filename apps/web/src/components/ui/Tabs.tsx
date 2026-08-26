"use client";

import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface TabsContextValue {
  value: string;
  setValue: (v: string) => void;
  baseId: string;
}
const TabsContext = createContext<TabsContextValue | null>(null);

export function Tabs({
  defaultValue,
  value: controlledValue,
  onValueChange,
  children,
  className,
}: {
  defaultValue?: string;
  value?: string;
  onValueChange?: (v: string) => void;
  children: ReactNode;
  className?: string;
}) {
  const [internal, setInternal] = useState(defaultValue ?? "");
  const baseId = useId();
  const value = controlledValue ?? internal;
  const setValue = (v: string) => {
    setInternal(v);
    onValueChange?.(v);
  };
  return (
    <TabsContext.Provider value={{ value, setValue, baseId }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className, "aria-label": ariaLabel }: { children: ReactNode; className?: string; "aria-label"?: string }) {
  return (
    // "El botón de menú no aparecía" en /campus/cursos (móvil) — con 4
    // pestañas sin envolver, esta fila era más ancha que la pantalla y
    // forzaba TODA la página (incluido el header) a agrandarse, empujando
    // el botón de menú fuera del viewport. overflow-x-auto + flex-nowrap
    // hace que solo ESTA fila se desplace horizontalmente, sin arrastrar al
    // resto de la página.
    <div role="tablist" aria-label={ariaLabel} className={cn("flex flex-nowrap gap-1 overflow-x-auto border-b border-paper-border", className)}>
      {children}
    </div>
  );
}

export function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("TabsTrigger debe usarse dentro de Tabs");
  const active = ctx.value === value;
  return (
    <button
      role="tab"
      id={`${ctx.baseId}-tab-${value}`}
      aria-selected={active}
      aria-controls={`${ctx.baseId}-panel-${value}`}
      tabIndex={active ? 0 : -1}
      onClick={() => ctx.setValue(value)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          const list = e.currentTarget.parentElement;
          const buttons = list ? Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]')) : [];
          const idx = buttons.indexOf(e.currentTarget);
          const next = e.key === "ArrowRight" ? (idx + 1) % buttons.length : (idx - 1 + buttons.length) % buttons.length;
          buttons[next]?.focus();
          buttons[next]?.click();
        }
      }}
      className={cn(
        "-mb-px flex-none whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
        active ? "border-ink-700 text-ink-800" : "border-transparent text-ash-500 hover:text-ash-700",
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("TabsContent debe usarse dentro de Tabs");
  if (ctx.value !== value) return null;
  return (
    <div id={`${ctx.baseId}-panel-${value}`} role="tabpanel" tabIndex={0} className={cn("animate-fade-in pt-5", className)}>
      {children}
    </div>
  );
}

"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Menu, X, ArrowLeft, Home } from "lucide-react";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { useBrandSettings } from "@/components/providers/BrandSettingsProvider";
import { cn } from "@/lib/cn";

export interface SidebarNavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function SidebarShell({
  navItems,
  brandHref,
  topRight,
  children,
}: {
  navItems: SidebarNavItem[];
  brandHref: string;
  topRight?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { sidebarColor, menuFontFamily, menuFontSizePx, menuFontColor } = useBrandSettings();
  // "Cambiar el tamaño, tipo y color de la letra de los menús, el color de
  // la barra lateral" — sin nada configurado, se mantiene exactamente el
  // aspecto anterior (bg-ink-900 vía clase, tipografía/color heredados).
  const menuTextStyle: React.CSSProperties = {
    ...(menuFontFamily ? { fontFamily: menuFontFamily } : {}),
    ...(menuFontSizePx ? { fontSize: `${menuFontSizePx}px` } : {}),
    ...(menuFontColor ? { color: menuFontColor } : {}),
  };
  // "el sistema no tiene un botón atrás... tengo que estar a cada rato dando
  // retroceder al navegador" — antes no había ninguna forma de volver salvo
  // el botón nativo del navegador. router.back() no es 100% confiable si el
  // usuario llegó por un link externo/nueva pestaña (no hay historial propio
  // de la app); en ese caso cae a brandHref (el panel de inicio del rol).
  const isHome = pathname === brandHref;
  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push(brandHref);
  }

  const nav = (
    <nav aria-label="Navegación" className="flex flex-col gap-1">
      {navItems.map((item) => {
        const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            aria-current={active ? "page" : undefined}
            style={menuTextStyle}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "bg-ink-800 text-paper" : "text-ink-100/80 hover:bg-ink-800/60 hover:text-paper",
            )}
          >
            <item.icon className="h-4 w-4 flex-none" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <a href="#main-content" className="skip-link sr-only focus:not-sr-only">
        Saltar al contenido principal
      </a>
      <aside
        className="hidden w-64 flex-none flex-col bg-ink-900 p-5 text-paper lg:flex"
        style={sidebarColor ? { backgroundColor: sidebarColor } : undefined}
      >
        <Link href={brandHref} className="mb-8 flex items-center" aria-label="Inkademy">
          <BrandLogo />
        </Link>
        {nav}
        <div className="mt-auto pt-6">{topRight}</div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-paper-border bg-paper px-4 lg:hidden">
          <div className="flex items-center gap-2">
            {!isHome && (
              <button type="button" onClick={goBack} aria-label="Atrás" className="p-2 text-ink-800">
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <Link href={brandHref} className="flex items-center" aria-label="Inkademy">
              <BrandLogo />
            </Link>
          </div>
          <button
            type="button"
            aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
            className="p-2 text-ink-800"
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </header>
        {mobileOpen && (
          <div className="border-b border-paper-border bg-ink-900 p-4 text-paper lg:hidden" style={sidebarColor ? { backgroundColor: sidebarColor } : undefined}>
            {nav}
            <div className="mt-4">{topRight}</div>
          </div>
        )}

        <div className="hidden items-center justify-between gap-3 border-b border-paper-border bg-paper px-6 py-3 lg:flex">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={goBack}
              disabled={isHome}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-ash-600 hover:bg-paper-muted hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Atrás
            </button>
            {!isHome && (
              <Link
                href={brandHref}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-ash-600 hover:bg-paper-muted hover:text-ink-900"
              >
                <Home className="h-4 w-4" aria-hidden="true" />
                Inicio
              </Link>
            )}
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <LocaleSwitcher />
          </div>
        </div>

        <main id="main-content" className="flex-1 bg-paper-muted p-4 sm:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

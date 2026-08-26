"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Menu, X, ArrowLeft, Home } from "lucide-react";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { ThemeToggle } from "./ThemeToggle";
import { useBrandSettings } from "@/components/providers/BrandSettingsProvider";
import { cn } from "@/lib/cn";

// "El botón retroceder no llega hasta la página de inicio, se desactiva
// antes" — router.back() delega en el historial CRUDO del navegador, que
// incluye entradas de fuera de la app (o de ANTES de iniciar sesión) y se
// comporta distinto según cómo se llegó a la página (link externo, pestaña
// nueva, un redirect que hizo replace() en vez de push()) — el propio
// código ya lo advertía como "no 100% confiable". En vez de intentar leer
// ese historial opaco, se lleva una pila propia de la app en
// sessionStorage (sobrevive a cambiar de sección admin/campus/docente,
// que remonta este componente) — "Atrás" navega exactamente a la página
// anterior QUE LA APP REALMENTE VISITÓ, sin las sorpresas del historial
// del navegador.
const NAV_STACK_KEY = "inkademy:nav-stack";
const NAV_STACK_MAX = 50;

function readNavStack(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(NAV_STACK_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeNavStack(stack: string[]) {
  try {
    window.sessionStorage.setItem(NAV_STACK_KEY, JSON.stringify(stack.slice(-NAV_STACK_MAX)));
  } catch {
    // sessionStorage puede no estar disponible (modo privado estricto) — el botón sigue funcionando, solo cae siempre a brandHref.
  }
}

export interface SidebarNavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Contador opcional (p.ej. tickets de soporte pendientes) — se muestra como una burbuja roja junto al ítem. */
  badgeCount?: number;
  /**
   * Encabezado de sección — cuando cambia respecto al ítem anterior, se
   * imprime una etiqueta antes de este ítem. "Un usuario con más de un rol
   * debería ver en el menú todas las opciones de cada rol" — cada layout
   * (admin/docente/campus) le agrega esta marca a los ítems que le presta a
   * otra área, para dejar claro de qué rol viene cada bloque.
   */
  section?: string;
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
  // el botón nativo del navegador. Ahora "Atrás" recorre la pila propia de
  // la app (ver NAV_STACK_KEY arriba) en vez del historial crudo del
  // navegador; si no queda nada más atrás, cae a brandHref (el panel de
  // inicio del rol).
  const isHome = pathname === brandHref;
  // "No llega hasta la página de inicio, se desactiva antes" — el bug real:
  // antes el botón se deshabilitaba apenas pathname===brandHref, pero un
  // usuario con más de un rol (ver roles.includes("TEACHER")/("STUDENT") en
  // cada layout) puede cruzar de /admin a /campus y de vuelta — /campus
  // TAMBIÉN es "home" para ese layout, así que el botón se apagaba ahí
  // mismo aunque siguiera habiendo páginas de /admin más atrás en la pila.
  // Ahora "puede retroceder" se calcula de la pila real, no de si la
  // página actual coincide con brandHref.
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    if (!pathname) return;
    const stack = readNavStack();
    if (stack[stack.length - 1] !== pathname) {
      stack.push(pathname);
      writeNavStack(stack);
    }
    setCanGoBack(stack.length > 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function goBack() {
    const stack = readNavStack();
    // La entrada en el tope es SIEMPRE la página actual (se agregó en el
    // efecto de arriba) — hay que sacarla primero para encontrar la
    // anterior de verdad.
    if (stack.length > 0 && stack[stack.length - 1] === pathname) stack.pop();
    const previous = stack.pop();
    writeNavStack(stack);
    router.push(previous ?? brandHref);
  }

  const nav = (
    <nav aria-label="Navegación" className="flex flex-col gap-1">
      {navItems.map((item, index) => {
        const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        const showSectionLabel = item.section && item.section !== navItems[index - 1]?.section;
        return (
          <div key={item.href}>
            {showSectionLabel && (
              <p className="mb-1 mt-4 px-3 text-xs font-semibold uppercase tracking-wide text-ink-300/70 first:mt-0">{item.section}</p>
            )}
            <Link
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
              <span className="flex-1">{item.label}</span>
              {Boolean(item.badgeCount) && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-xs font-bold text-white">
                  {item.badgeCount}
                </span>
              )}
            </Link>
          </div>
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
            {canGoBack && (
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
              disabled={!canGoBack}
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

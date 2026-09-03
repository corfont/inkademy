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
  /**
   * "Los íconos podrían tener colores... todo lo has hecho como si fuera
   * una web de los 2000" — clases Tailwind para el chip que envuelve el
   * ícono (fondo + color de texto), p.ej. `"bg-emerald-400/20 text-emerald-300"`.
   * Pensadas para el fondo OSCURO de la barra (`bg-ink-800`/`bg-ink-900`) —
   * por eso usan tintes con opacidad de la paleta completa de Tailwind
   * (violet/emerald/sky/...) y no los tokens de marca (ink/ash/success/
   * warning/danger), que están pensados para fondo claro.
   */
  colorClassName?: string;
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
  //
  // "Cuando le doy al botón de la casita para ir al inicio, no va al
  // inicio" — el botón "Inicio" se ocultaba por completo cuando
  // pathname===brandHref (isHome), así que si el usuario ya estaba "cerca"
  // de home (p.ej. en /campus mismo, con el resto de la vista aún
  // cargando) el botón desaparecía justo donde antes estaba y el clic caía
  // en otro elemento — se percibía como "no pasa nada". Ahora se muestra
  // siempre; en home queda simplemente resaltado (aria-current) en vez de
  // desaparecer.
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
              <span
                className={cn(
                  "flex h-7 w-7 flex-none items-center justify-center rounded-md transition-colors",
                  item.colorClassName ?? "bg-white/5 text-ink-100/70",
                )}
              >
                <item.icon className="h-4 w-4" />
              </span>
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

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-paper-border bg-paper px-4 lg:hidden">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {canGoBack && (
              <button type="button" onClick={goBack} aria-label="Atrás" className="p-2 text-ink-800">
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            {/* El header móvil solo tenía el logo (no se ve como una
                "casita") y ningún ícono de inicio equivalente al de
                escritorio — se agrega aquí para que exista la misma
                acción visible en ambos tamaños de pantalla. */}
            {!isHome && (
              <Link href={brandHref} aria-label="Inicio" className="p-2 text-ink-800">
                <Home className="h-5 w-5" />
              </Link>
            )}
            <Link href={brandHref} className="flex min-w-0 items-center" aria-label="Inkademy">
              <BrandLogo maxHeightPx={28} className="max-w-full" />
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
            <Link
              href={brandHref}
              aria-current={isHome ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium hover:bg-paper-muted hover:text-ink-900",
                isHome ? "text-ink-900" : "text-ash-600",
              )}
            >
              <Home className="h-4 w-4" aria-hidden="true" />
              Inicio
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <LocaleSwitcher />
          </div>
        </div>

        {/* overflow-x-hidden: respaldo — si una pantalla nueva algún día
            vuelve a tener contenido más ancho que el viewport (como pasaba
            con las pestañas de "Mis cursos" en móvil), ese contenido se
            recorta AQUÍ en vez de agrandar todo el documento y empujar el
            botón de menú del header fuera de la pantalla. */}
        <main id="main-content" className="min-w-0 flex-1 overflow-x-hidden bg-paper-muted p-4 sm:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

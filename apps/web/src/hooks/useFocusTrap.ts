"use client";

import { useEffect, type RefObject } from "react";

/**
 * Trampa de foco compartida — antes solo existía inline dentro de
 * components/ui/Dialog.tsx; el drawer móvil de SidebarShell.tsx tenía
 * `aria-modal="true"` pero SOLO movía el foco al abrir/cerrar sin
 * interceptar Tab, así que un usuario de teclado podía tabular hacia
 * afuera del panel, hacia contenido de la página subyacente que sigue en
 * el DOM (contradiciendo lo que `aria-modal` promete). Se extrajo acá
 * para que ambos compartan exactamente el mismo comportamiento.
 *
 * `initialFocus`: "container" enfoca el propio contenedor (debe tener
 * `tabIndex={-1}`, como el `<div role="dialog">` de Dialog.tsx); "first"
 * enfoca el primer elemento focuseable dentro (usado por el drawer móvil,
 * que no quiere foco en un contenedor sin rol semántico propio).
 */
export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  options?: { initialFocus?: "container" | "first"; lockScroll?: boolean },
) {
  const initialFocus = options?.initialFocus ?? "container";
  const lockScroll = options?.lockScroll ?? true;

  useEffect(() => {
    if (!active) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    if (initialFocus === "container") {
      containerRef.current?.focus();
    } else {
      containerRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const focusable = containerRef.current?.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    if (lockScroll) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (lockScroll) document.body.style.overflow = "";
      previouslyFocused?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, onClose]);
}

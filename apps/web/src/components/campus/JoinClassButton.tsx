"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { liveSessionApi, ApiError } from "@/lib/api-client";

/**
 * Llama a GET /live-sessions/:id/join (valida matrícula + ventana horaria de
 * 15 min antes de la clase) y abre el joinUrl en una pestaña nueva.
 * Compartido por JoinClassButton (el botón explícito) y por el propio
 * evento del calendario (ver CalendarView.tsx EventTitle) — "debería
 * poderse también hacer clic en el calendario", no solo en el botón
 * separado más abajo.
 */
export function useJoinLiveSession(liveSessionId: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    // "Cuando se abre el zoom para una clase debe ser en una pestaña nueva
    // del explorador" — YA se llamaba a window.open(joinUrl, "_blank"), pero
    // después de un `await` a la API: varios navegadores (Safari sobre
    // todo) solo permiten abrir una pestaña nueva de forma síncrona, dentro
    // del mismo gesto de clic — una vez que el `await` rompe esa cadena, el
    // bloqueador de pop-ups puede descartarla en silencio (sin lanzar
    // error, sin avisar nada). Por eso se abre la pestaña EN BLANCO de
    // inmediato (todavía dentro del clic) y recién se le asigna la URL real
    // cuando la respuesta llega.
    const newTab = window.open("", "_blank", "noopener,noreferrer");
    try {
      const { joinUrl } = await liveSessionApi.join(liveSessionId);
      if (newTab) {
        newTab.location.href = joinUrl;
      } else {
        // El navegador bloqueó incluso la pestaña en blanco (o el usuario
        // tiene pop-ups desactivados) — se intenta una vez más, ya con la
        // URL final, en vez de dejar al alumno sin ninguna forma de entrar.
        window.open(joinUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      newTab?.close();
      setError(err instanceof ApiError ? err.message : "No pudimos abrir la clase en este momento.");
    } finally {
      setLoading(false);
    }
  }

  return { handleClick, loading, error };
}

export function JoinClassButton({ liveSessionId }: { liveSessionId: string }) {
  const t = useTranslations("campus.agenda");
  const { handleClick, loading, error } = useJoinLiveSession(liveSessionId);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={handleClick} disabled={loading}>
        {loading ? "…" : t("joinClass")}
      </Button>
      {error && <p className="max-w-[16rem] text-right text-xs text-danger">{error}</p>}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { liveSessionApi, ApiError } from "@/lib/api-client";

/**
 * Llama a GET /live-sessions/:id/join (valida matrícula + ventana horaria de
 * 15 min antes de la clase) y abre el joinUrl de Teams en una pestaña nueva.
 * Antes este botón no tenía ninguna acción conectada.
 */
export function JoinClassButton({ liveSessionId }: { liveSessionId: string }) {
  const t = useTranslations("campus.agenda");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const { joinUrl } = await liveSessionApi.join(liveSessionId);
      window.open(joinUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos abrir la clase en este momento.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={handleClick} disabled={loading}>
        {loading ? "…" : t("joinClass")}
      </Button>
      {error && <p className="max-w-[16rem] text-right text-xs text-danger">{error}</p>}
    </div>
  );
}

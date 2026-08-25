"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, ApiError } from "@/lib/api-client";
import { Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";

/**
 * Antes vivía dentro de /admin/asistente-ia junto a la config general del
 * chatbot — se separó a /admin/configuracion (junto a comisiones/IGV/
 * detracción) para que no se toque por equivocación desde una pantalla de
 * uso más casual (pedido explícito: "todo lo que se parametriza debería
 * estar separado en un módulo aparte").
 */
export function SuggestionAutoRespondForm({
  suggestionAutoRespond,
  suggestionAutoRespondDelayMinutes,
}: {
  suggestionAutoRespond: boolean;
  suggestionAutoRespondDelayMinutes: number;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(suggestionAutoRespond);
  const [delayMinutes, setDelayMinutes] = useState(suggestionAutoRespondDelayMinutes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await adminApi.updateChatbotSettings({ suggestionAutoRespond: enabled, suggestionAutoRespondDelayMinutes: delayMinutes });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar la configuración.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ash-500">
        Si se activa, la IA redacta y envía sola la respuesta a una sugerencia nueva — pero recién después del plazo configurado (nunca inmediato,
        para que no se note que es una IA), y solo si el admin no la respondió antes a mano. Si se deja apagado, toda sugerencia queda esperando la
        aprobación del admin en /admin/sugerencias (comportamiento anterior).
      </p>
      <label className="flex items-center gap-2 text-sm font-medium text-ink-900">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Responder sugerencias automáticamente con IA
      </label>
      {enabled && (
        <div className="max-w-xs">
          <Label htmlFor="auto-respond-delay">Esperar antes de enviar: {delayMinutes} minutos</Label>
          <input
            id="auto-respond-delay"
            type="range"
            min={1}
            max={180}
            value={delayMinutes}
            onChange={(e) => setDelayMinutes(Number(e.target.value))}
            className="w-full"
          />
        </div>
      )}
      <div>
        <Button size="sm" variant="outline" disabled={busy} onClick={handleSave}>
          {busy ? "…" : saved ? "Guardado ✓" : "Guardar"}
        </Button>
      </div>
      {error && <Callout variant="danger">{error}</Callout>}
    </div>
  );
}

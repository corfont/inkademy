"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { liveSessionApi, ApiError } from "@/lib/api-client";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";

/**
 * PATCH /live-sessions/:id/reschedule ya existe en la API pero antes no
 * había ninguna pantalla para dispararlo — un docente/admin no tenía forma
 * de reprogramar una clase en vivo sin tocar la base a mano.
 */
export function RescheduleSessionControl({
  sessionId,
  currentStartsAt,
  currentEndsAt,
}: {
  sessionId: string;
  currentStartsAt: string;
  currentEndsAt: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [startsAt, setStartsAt] = useState(currentStartsAt.slice(0, 16));
  const [endsAt, setEndsAt] = useState(currentEndsAt.slice(0, 16));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notifiedCount, setNotifiedCount] = useState<number | null>(null);

  async function handleConfirm() {
    if (!startsAt || !endsAt) {
      setError("Indica la nueva fecha de inicio y fin.");
      return;
    }
    if (reason.trim().length < 3) {
      setError("Indica el motivo de la reprogramación (se incluye en el correo a los inscritos).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await liveSessionApi.reschedule(sessionId, {
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        reason: reason.trim(),
      });
      setNotifiedCount(result.notifiedCount);
      router.refresh();
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos reprogramar la sesión.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          Reprogramar
        </Button>
        {notifiedCount !== null && (
          <p className="text-xs text-ash-500">Se avisó a {notifiedCount} inscrito{notifiedCount === 1 ? "" : "s"}.</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-paper-border bg-paper p-4">
      <p className="text-sm font-medium text-ink-900">Reprogramar clase — se avisa por correo a todos los inscritos activos.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`reschedule-start-${sessionId}`}>Nuevo inicio</Label>
          <Input id={`reschedule-start-${sessionId}`} type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </div>
        <div>
          <Label htmlFor={`reschedule-end-${sessionId}`}>Nuevo fin</Label>
          <Input id={`reschedule-end-${sessionId}`} type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </div>
      </div>
      <textarea
        className="min-h-[3.5rem] rounded-md border border-paper-border bg-paper p-2 text-sm"
        placeholder="Motivo (ej. el docente tuvo un imprevisto)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {error && <Callout variant="danger">{error}</Callout>}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Volver
        </Button>
        <Button size="sm" onClick={handleConfirm} disabled={busy}>
          {busy ? "Reprogramando…" : "Confirmar y avisar a inscritos"}
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { adminApi, ApiError } from "@/lib/api-client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

/**
 * "El administrador como caso especial podría ampliar el plazo" — acción
 * puntual sobre UNA matrícula (no confundir con la renovación de cupos B2B,
 * que es sobre el CompanySeatPool completo). Vacío = deja el curso abierto
 * (sin vencimiento) para este alumno en particular.
 */
export function ExtendAccessControl({ enrollmentId, accessExpiresAt }: { enrollmentId: string; accessExpiresAt: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(accessExpiresAt ? accessExpiresAt.slice(0, 10) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      await adminApi.extendEnrollmentAccess(enrollmentId, date ? new Date(`${date}T23:59:59`).toISOString() : null);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos actualizar el plazo.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <CalendarClock className="h-4 w-4" aria-hidden="true" /> Ampliar plazo
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-36 text-xs" />
        <Button size="sm" disabled={busy} onClick={handleSave}>
          {busy ? "…" : "Guardar"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
      <button type="button" className="text-left text-xs text-ash-500 underline-offset-2 hover:underline" onClick={() => setDate("")}>
        Dejar sin vencimiento (abierto)
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

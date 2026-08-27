"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { adminApi, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";

/**
 * "El administrador debería tener la facultad de resetear un avance a 0%
 * o ponerlo como 100% por si hubiera algún error que tiene que solucionar
 * con el alumno (en casos extremos)." — acción puntual sobre UNA matrícula
 * de curso (no aplica a programas). Confirma antes de aplicar: mueve
 * avance real (lecciones/lecturas marcadas), no solo un número — no es
 * trivial de deshacer a mano.
 */
export function ResetProgressControl({ enrollmentId }: { enrollmentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"ZERO" | "FULL" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleReset(target: "ZERO" | "FULL") {
    const confirmMsg =
      target === "ZERO"
        ? "¿Reiniciar el avance de este alumno a 0%? Se desmarcan todas sus lecciones y lecturas completadas en este curso."
        : "¿Forzar el avance de este alumno a 100%? Se marcan todas las lecciones y lecturas del curso como completadas.";
    if (!confirm(confirmMsg)) return;
    setBusy(target);
    setError(null);
    try {
      await adminApi.resetEnrollmentProgress(enrollmentId, target);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos actualizar el avance.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => handleReset("ZERO")}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> {busy === "ZERO" ? "…" : "0%"}
        </Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => handleReset("FULL")}>
          {busy === "FULL" ? "…" : "100%"}
        </Button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

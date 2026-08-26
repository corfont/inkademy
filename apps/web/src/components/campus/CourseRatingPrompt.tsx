"use client";

import { useState } from "react";
import { Star, PartyPopper } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { meApi } from "@/lib/api-client";
import { cn } from "@/lib/cn";

/**
 * "Una vez que el alumno termina el curso debería aparecerle un mensaje para
 * marcar las estrellas que considera del curso y poner un comentario debajo...
 * debe ser bastante visual, evitar texto". Se muestra cuando
 * ClassroomDetail.readyForRatingPrompt=true (el curso ya cumple todo lo
 * demás, solo falta esto) y aún no hay myRating — bloquea, en el backend, la
 * emisión del certificado hasta que se envíe (ver CertificateService.checkAndIssueIfEligible).
 */
export function CourseRatingPrompt({
  enrollmentId,
  open,
  onClose,
  onSubmitted,
}: {
  enrollmentId: string;
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [stars, setStars] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (stars === 0) {
      setError("Elige de 1 a 5 estrellas");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await meApi.submitRating(enrollmentId, stars, comment.trim() || undefined);
      onSubmitted();
    } catch {
      setError("No se pudo guardar tu calificación. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  const shown = hovered || stars;

  return (
    <Dialog open={open} onClose={onClose} title="¡Terminaste el curso!" className="max-w-md text-center">
      <div className="flex flex-col items-center gap-5 py-2">
        <PartyPopper className="h-10 w-10 text-warning" aria-hidden="true" />
        <div className="flex gap-1.5" role="radiogroup" aria-label="Calificación en estrellas">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={stars === n}
              aria-label={`${n} estrella${n > 1 ? "s" : ""}`}
              onMouseEnter={() => setHovered(n)}
              onMouseLeave={() => setHovered(0)}
              onClick={() => {
                setStars(n);
                setError(null);
              }}
              className="p-0.5 transition-transform hover:scale-110"
            >
              <Star
                className={cn("h-10 w-10", n <= shown ? "fill-warning text-warning" : "fill-none text-ash-300")}
                strokeWidth={1.5}
              />
            </button>
          ))}
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Cuéntanos qué te pareció (opcional)"
          rows={3}
          className="w-full resize-none rounded-lg border border-paper-border bg-paper p-3 text-sm"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button onClick={handleSubmit} disabled={saving} className="w-full">
          {saving ? "Guardando…" : "Enviar y obtener certificado"}
        </Button>
        <p className="text-xs text-ash-500">Tu certificado se emite apenas envíes tu calificación.</p>
      </div>
    </Dialog>
  );
}

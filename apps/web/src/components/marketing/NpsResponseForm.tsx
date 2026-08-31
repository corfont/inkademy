"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { npsPublicApi, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

type Zone = "detractor" | "passive" | "promoter";

function zoneOf(n: number): Zone {
  if (n >= 9) return "promoter";
  if (n >= 7) return "passive";
  return "detractor";
}

// Mismo criterio de color que el resultado del admin (ver NpsSurveyManager):
// verde = promotor, ámbar = pasivo, rojo = detractor. Antes solo se veía al
// hacer clic — ahora la escala entera ya viene graduada por color en reposo
// ("más gráfica, con colores"), y el color se satura al elegir.
const ZONE_STYLE: Record<Zone, { resting: string; active: string; label: string; labelClass: string }> = {
  promoter: {
    resting: "border-success/30 bg-success-bg text-success hover:bg-success/20",
    active: "border-success bg-success text-white shadow-lg shadow-success/30 scale-110",
    label: "Promotor 🎉",
    labelClass: "text-success",
  },
  passive: {
    resting: "border-warning/30 bg-warning-bg text-warning hover:bg-warning/20",
    active: "border-warning bg-warning text-white shadow-lg shadow-warning/30 scale-110",
    label: "Pasivo",
    labelClass: "text-warning",
  },
  detractor: {
    resting: "border-danger/30 bg-danger-bg text-danger hover:bg-danger/20",
    active: "border-danger bg-danger text-white shadow-lg shadow-danger/30 scale-110",
    label: "Detractor",
    labelClass: "text-danger",
  },
};

/**
 * "La encuesta NPS tiene que ser del 0 al 10 (no estrellas) y aparte una
 * pregunta cualitativa que el administrador puede redactar" — escala NPS
 * estándar de 11 botones (0-10) + la segunda pregunta con el texto que
 * definió el admin. Las estrellas quedan reservadas para la encuesta de
 * satisfacción de curso (CourseRating), un sistema aparte.
 */
export function NpsResponseForm({ token, question, commentPrompt }: { token: string; question: string; commentPrompt: string }) {
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (score === null) {
      setError("Elige una nota del 0 al 10");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await npsPublicApi.submit(token, score, comment.trim() || undefined);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    const zone = score !== null ? zoneOf(score) : "promoter";
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <span className={cn("flex h-16 w-16 items-center justify-center rounded-full", ZONE_STYLE[zone].resting)}>
          <CheckCircle2 className="h-9 w-9" aria-hidden="true" />
        </span>
        <p className="font-serif text-xl font-semibold text-ink-900">¡Gracias por tu opinión!</p>
        <p className="text-sm text-ash-500">Tu respuesta nos ayuda a mejorar Inkademy.</p>
      </div>
    );
  }

  const zone = score !== null ? zoneOf(score) : null;

  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <p className="font-serif text-2xl font-semibold leading-snug text-ink-900">{question}</p>

      <div className="flex w-full flex-col gap-2">
        <div className="grid grid-cols-11 gap-1" role="radiogroup" aria-label="Calificación del 0 al 10">
          {Array.from({ length: 11 }, (_, n) => {
            const style = ZONE_STYLE[zoneOf(n)];
            const selected = score === n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${n} de 10`}
                onClick={() => {
                  setScore(n);
                  setError(null);
                }}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-md border text-sm font-semibold transition-all",
                  selected ? style.active : style.resting,
                )}
              >
                {n}
              </button>
            );
          })}
        </div>
        <div className="flex justify-between text-xs text-ash-500">
          <span>Nada probable</span>
          <span>Extremadamente probable</span>
        </div>
        {/* Refuerzo visual inmediato: qué significa el número que se acaba de elegir, no solo un número suelto. */}
        <p className={cn("h-5 text-sm font-semibold transition-colors", zone ? ZONE_STYLE[zone].labelClass : "text-transparent")}>
          {zone ? ZONE_STYLE[zone].label : "—"}
        </p>
      </div>

      <div className="w-full border-t border-paper-border pt-5">
        <p className="mb-2 text-sm font-medium text-ink-800">{commentPrompt}</p>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Escribe aquí (opcional)"
          rows={3}
          className="w-full resize-none rounded-lg border border-paper-border bg-paper p-3 text-sm"
        />
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      <Button onClick={handleSubmit} disabled={saving} variant="indigo" className="w-full">
        {saving ? "Enviando…" : "Enviar"}
      </Button>
    </div>
  );
}

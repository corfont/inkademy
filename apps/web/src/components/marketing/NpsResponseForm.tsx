"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { npsPublicApi, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

// Verde para las notas altas (promotor), ámbar para pasivo, rojo para
// detractor — mismo criterio de color que usa el resultado del admin
// (ver NpsSurveyManager), para que la persona vea de entrada qué está
// marcando, no solo un número suelto.
function scoreColor(n: number, selected: boolean) {
  if (!selected) return "border-paper-border text-ash-500 hover:border-ink-400 hover:text-ink-900";
  if (n >= 9) return "border-success bg-success text-white";
  if (n >= 7) return "border-warning bg-warning text-white";
  return "border-danger bg-danger text-white";
}

/**
 * "La encuesta NPS tiene que ser del 0 al 10 (no estrellas) y aparte una
 * pregunta cualitativa que el administrador puede redactar" — escala NPS
 * estándar de 11 botones (0-10) + la segunda pregunta con el texto que
 * definió el admin (antes era fijo). Las estrellas quedan reservadas para
 * la encuesta de satisfacción de curso (CourseRating), un sistema aparte.
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
    return (
      <div className="flex flex-col items-center gap-3 py-6 text-center">
        <CheckCircle2 className="h-12 w-12 text-success" aria-hidden="true" />
        <p className="font-serif text-xl font-semibold text-ink-900">¡Gracias por tu opinión!</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <p className="font-serif text-xl font-semibold text-ink-900">{question}</p>

      <div className="flex w-full flex-col gap-2">
        <div className="grid grid-cols-11 gap-1" role="radiogroup" aria-label="Calificación del 0 al 10">
          {Array.from({ length: 11 }, (_, n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={score === n}
              aria-label={`${n} de 10`}
              onClick={() => {
                setScore(n);
                setError(null);
              }}
              className={cn(
                "flex aspect-square items-center justify-center rounded-md border text-sm font-semibold transition-colors",
                scoreColor(n, score === n),
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-xs text-ash-500">
          <span>Nada probable</span>
          <span>Extremadamente probable</span>
        </div>
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
      <Button onClick={handleSubmit} disabled={saving} className="w-full">
        {saving ? "Enviando…" : "Enviar"}
      </Button>
    </div>
  );
}

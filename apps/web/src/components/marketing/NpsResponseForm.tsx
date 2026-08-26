"use client";

import { useState } from "react";
import { CheckCircle2, Star } from "lucide-react";
import { npsPublicApi, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

/**
 * "Esta encuesta tiene que ser gráficamente bonita para que cuando le
 * llegue al usuario solo con el mouse marque la estrella correspondiente
 * acumulada y haya otra pregunta más abajo... donde la empresa podrá
 * poner sus comentarios" — 5 estrellas (mismo widget visual que
 * CourseRatingPrompt, para que toda la plataforma use un solo lenguaje de
 * calificación) + una segunda pregunta fija para el comentario, en vez de
 * un textarea genérico sin rotular.
 */
export function NpsResponseForm({ token, question, commentPrompt }: { token: string; question: string; commentPrompt: string }) {
  const [score, setScore] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (score === 0) {
      setError("Elige de 1 a 5 estrellas");
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

  const shown = hovered || score;

  return (
    <div className="flex flex-col items-center gap-6 py-4 text-center">
      <p className="font-serif text-xl font-semibold text-ink-900">{question}</p>
      <div className="flex gap-1.5" role="radiogroup" aria-label="Calificación en estrellas">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={score === n}
            aria-label={`${n} estrella${n > 1 ? "s" : ""}`}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => {
              setScore(n);
              setError(null);
            }}
            className="p-0.5 transition-transform hover:scale-110"
          >
            <Star className={cn("h-10 w-10", n <= shown ? "fill-warning text-warning" : "fill-none text-ash-300")} strokeWidth={1.5} />
          </button>
        ))}
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

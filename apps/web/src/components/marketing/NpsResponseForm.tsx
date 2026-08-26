"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { npsPublicApi, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

// 0-6 rojo (detractor), 7-8 ámbar (pasivo), 9-10 verde (promotor) — mismo
// criterio de la fórmula NPS estándar que usa NpsService.listResponses,
// para que el color que ve la empresa sea consistente con cómo se calcula.
function scoreColor(n: number, selected: boolean) {
  if (!selected) return "border-paper-border text-ash-500 hover:border-ink-300";
  if (n <= 6) return "border-danger bg-danger text-white";
  if (n <= 8) return "border-warning bg-warning text-white";
  return "border-success bg-success text-white";
}

/**
 * "Esta encuesta debe ser bastante visual, evitar texto" — una fila de
 * números 0-10 (escala NPS estándar), sin escalas de estrellas ni texto
 * explicativo adicional; el comentario queda como único campo de texto.
 */
export function NpsResponseForm({ token, question }: { token: string; question: string }) {
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (score === null) {
      setError("Elige un número del 0 al 10");
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
    <div className="flex flex-col items-center gap-6 py-4 text-center">
      <p className="font-serif text-xl font-semibold text-ink-900">{question}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {Array.from({ length: 11 }, (_, n) => n).map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={score === n}
            aria-label={`${n}`}
            onClick={() => {
              setScore(n);
              setError(null);
            }}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors",
              scoreColor(n, score === n),
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex w-full max-w-xs justify-between text-xs text-ash-500">
        <span>Nada probable</span>
        <span>Muy probable</span>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="¿Algo que quieras contarnos? (opcional)"
        rows={3}
        className="w-full resize-none rounded-lg border border-paper-border bg-paper p-3 text-sm"
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      <Button onClick={handleSubmit} disabled={saving} className="w-full">
        {saving ? "Enviando…" : "Enviar"}
      </Button>
    </div>
  );
}

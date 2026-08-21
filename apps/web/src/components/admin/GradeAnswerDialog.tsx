"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Label } from "@/components/ui/Input";
import { Callout } from "@/components/ui/Callout";

export function GradeAnswerDialog({ attemptId, answerId, questionText, studentAnswer }: { attemptId: string; answerId: string; questionText: string; studentAnswer: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState(70);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleGrade(isCorrect: boolean) {
    setSubmitting(true);
    setError(null);
    try {
      await adminApi.gradeAnswer(attemptId, answerId, { score, isCorrect });
      setOpen(false);
      router.refresh();
    } catch {
      setError("No pudimos guardar la calificación. Intenta nuevamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Calificar
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Calificar respuesta">
        <div className="flex flex-col gap-4">
          {error && <Callout variant="danger">{error}</Callout>}
          <div>
            <p className="text-sm font-medium text-ash-700">Pregunta</p>
            <p className="mt-1 text-sm text-ash-600">{questionText}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-ash-700">Respuesta del alumno</p>
            <p className="mt-1 rounded-md bg-paper-muted p-3 text-sm text-ash-800">{studentAnswer}</p>
          </div>
          <div>
            <Label htmlFor="score">Puntaje (0-100)</Label>
            <Input id="score" type="number" min={0} max={100} value={score} onChange={(e) => setScore(Number(e.target.value))} />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="danger" disabled={submitting} onClick={() => handleGrade(false)}>
              Marcar incorrecta
            </Button>
            <Button disabled={submitting} onClick={() => handleGrade(true)}>
              Marcar correcta
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

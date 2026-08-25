"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Label } from "@/components/ui/Input";
import { Callout } from "@/components/ui/Callout";

/**
 * Califica un examen "cualitativo" completo (archivo) — a diferencia de
 * `GradeAnswerDialog` (una respuesta abierta puntual), acá se ve/descarga
 * el archivo que subió el alumno y se pone una nota + aprobado/no aprobado
 * de una sola vez, porque no hay preguntas individuales que sumar.
 */
export function GradeFileAttemptDialog({
  attemptId,
  studentName,
  submissionUrl,
  submissionMimeType,
}: {
  attemptId: string;
  studentName: string;
  submissionUrl: string | null;
  submissionMimeType: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState(70);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleGrade(passed: boolean) {
    setSubmitting(true);
    setError(null);
    try {
      await adminApi.gradeFileAttempt(attemptId, { score, passed });
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
      <Dialog open={open} onClose={() => setOpen(false)} title={`Calificar a ${studentName}`}>
        <div className="flex flex-col gap-4">
          {error && <Callout variant="danger">{error}</Callout>}
          {submissionUrl ? (
            <a
              href={submissionUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md bg-paper-muted p-3 text-sm font-medium text-ink-700 hover:underline"
            >
              Descargar el archivo que subió el alumno {submissionMimeType && <span className="text-ash-500">({submissionMimeType})</span>}
            </a>
          ) : (
            <Callout variant="danger">No se encontró el archivo subido — revisa el intento manualmente.</Callout>
          )}
          <div>
            <Label htmlFor="file-score">Puntaje (0-100)</Label>
            <Input id="file-score" type="number" min={0} max={100} value={score} onChange={(e) => setScore(Number(e.target.value))} />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="danger" disabled={submitting} onClick={() => handleGrade(false)}>
              No aprobado
            </Button>
            <Button disabled={submitting} onClick={() => handleGrade(true)}>
              Aprobado
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

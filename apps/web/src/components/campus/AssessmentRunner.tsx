"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";
import { assessmentApi, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Dialog } from "@/components/ui/Dialog";

export interface AssessmentQuestion {
  id: string;
  type: "SINGLE_CHOICE" | "MULTI_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER" | "OPEN" | "ORDERING";
  text: string;
  options?: { id: string; text: string }[];
}

/** Pregunta de "ordenar" — el alumno reordena las opciones (ya vienen barajadas del servidor) con flechas arriba/abajo. */
function OrderingField({
  question,
  answers,
  setAnswers,
}: {
  question: AssessmentQuestion;
  answers: Record<string, unknown>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
}) {
  const order = (answers[question.id] as string[] | undefined) ?? question.options?.map((o) => o.id) ?? [];

  useEffect(() => {
    if (answers[question.id] === undefined && question.options) {
      setAnswers((a) => ({ ...a, [question.id]: question.options!.map((o) => o.id) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id]);

  function move(index: number, direction: -1 | 1) {
    const next = [...order];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setAnswers((a) => ({ ...a, [question.id]: next }));
  }

  const byId = new Map((question.options ?? []).map((o) => [o.id, o.text]));

  return (
    <ol className="flex flex-col gap-2">
      {order.map((id, i) => (
        <li key={id} className="flex items-center justify-between gap-2 rounded-md border border-paper-border bg-paper p-3 text-sm">
          <span>
            <span className="mr-2 font-semibold text-ash-400">{i + 1}.</span>
            {byId.get(id)}
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir">
              ↑
            </Button>
            <Button size="sm" variant="ghost" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label="Bajar">
              ↓
            </Button>
          </div>
        </li>
      ))}
    </ol>
  );
}

export interface AssessmentDefinition {
  id: string;
  title: string;
  timeLimitMinutes: number | null;
  displayMode?: "ALL_AT_ONCE" | "ONE_BY_ONE";
  questions: AssessmentQuestion[];
  // Examen "cualitativo" — sin preguntas: se descarga sourceFileUrl, se
  // completa offline, y se sube la respuesta como archivo (ver
  // FileUploadRunner más abajo).
  isFileUpload?: boolean;
  sourceFileUrl?: string | null;
  sourceFileMimeType?: string | null;
}

/**
 * Examen "cualitativo" (archivo) — el alumno descarga el archivo que subió
 * el docente, lo completa offline, y sube su respuesta como otro archivo.
 * Queda PENDING_REVIEW hasta que el docente lo califique a mano viendo el
 * archivo (no hay nota inmediata como en las preguntas autocorregidas).
 */
// Debe calzar con DOCUMENT_MIME_PREFIXES del lado del API (fileMimeFilter) —
// si no, el alumno solo se enteraría del rechazo DESPUÉS de subir el archivo.
const FILE_UPLOAD_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/png,image/jpeg,image/webp,image/gif,application/pdf";
const FILE_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileUploadRunner({ assessment }: { assessment: AssessmentDefinition }) {
  const t = useTranslations("campus.assessment");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const attemptIdRef = useRef<string>(`mock-attempt-${assessment.id}`);

  const totalSeconds = (assessment.timeLimitMinutes ?? 0) * 60;
  const [remaining, setRemaining] = useState(totalSeconds);
  const timeExpired = Boolean(assessment.timeLimitMinutes) && remaining <= 0;

  useEffect(() => {
    assessmentApi
      .createAttempt(assessment.id)
      .then((attempt) => {
        if (attempt?.id) attemptIdRef.current = attempt.id;
      })
      .catch(() => {});
  }, [assessment.id]);

  // Mismo temporizador visual que el examen por preguntas — a diferencia de
  // ese, acá NO hay un "enviar lo que había" automático al llegar a cero
  // (no tendría sentido forzar el envío sin archivo elegido): solo se
  // bloquea seguir eligiendo/enviando y se avisa que el tiempo se acabó.
  useEffect(() => {
    if (!assessment.timeLimitMinutes || done) return;
    const interval = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(interval);
  }, [assessment.timeLimitMinutes, done]);

  function handleFileChange(selected: File | null) {
    setFileError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    if (selected.size > FILE_UPLOAD_MAX_BYTES) {
      setFileError(`El archivo pesa ${formatFileSize(selected.size)} — el máximo permitido es ${formatFileSize(FILE_UPLOAD_MAX_BYTES)}.`);
      setFile(null);
      return;
    }
    setFile(selected);
  }

  async function handleSubmit() {
    if (!file) return;
    setConfirmOpen(false);
    setSubmitting(true);
    setError(null);
    try {
      const { assetId, mimeType } = await assessmentApi.uploadSubmission(file);
      await assessmentApi.submitFile(attemptIdRef.current, { submissionAssetId: assetId, submissionMimeType: mimeType });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("submitError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-paper-border bg-paper p-8 text-center shadow-card">
        <h1 className="font-serif text-2xl font-semibold text-ink-900">{t("resultTitle")}</h1>
        <Callout variant="warning" className="mt-4 text-left">
          {t("pendingReview")}
        </Callout>
      </div>
    );
  }

  const minutes = String(Math.floor(remaining / 60)).padStart(2, "0");
  const seconds = String(remaining % 60).padStart(2, "0");

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-serif text-xl font-semibold text-ink-900">{assessment.title}</h1>
        {assessment.timeLimitMinutes ? (
          <div className="flex items-center gap-1.5 text-sm font-medium text-ink-800" role="timer" aria-live="polite">
            <Clock className="h-4 w-4" aria-hidden="true" />
            {minutes}:{seconds}
          </div>
        ) : (
          <span className="text-xs text-ash-400">Sin límite de tiempo</span>
        )}
      </div>
      {timeExpired && <Callout variant="warning" className="mb-4">Se acabó el tiempo para este examen — si ya tenías tu archivo listo, igual puedes enviarlo.</Callout>}
      {error && <Callout variant="danger" className="mb-4">{error}</Callout>}
      {fileError && <Callout variant="danger" className="mb-4">{fileError}</Callout>}
      {assessment.sourceFileUrl && (
        <a
          href={assessment.sourceFileUrl}
          target="_blank"
          rel="noreferrer"
          className="mb-4 block rounded-md bg-paper-muted p-4 text-sm font-medium text-ink-700 hover:underline"
        >
          1. Descarga el examen{assessment.sourceFileMimeType && <span className="text-ash-500"> ({assessment.sourceFileMimeType})</span>}
        </a>
      )}
      <div className="rounded-md border border-dashed border-paper-border p-4">
        <label htmlFor="file-upload-input" className="mb-2 block text-sm font-medium text-ink-900">
          2. Sube tu respuesta (Word, Excel, PPT, imagen o PDF — máx. {formatFileSize(FILE_UPLOAD_MAX_BYTES)})
        </label>
        <input
          id="file-upload-input"
          type="file"
          accept={FILE_UPLOAD_ACCEPT}
          onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          className="block w-full text-sm"
        />
        {file && (
          <div className="mt-3 flex items-center justify-between rounded-md bg-paper-muted p-2.5 text-sm">
            <span className="truncate text-ink-900">
              {file.name} <span className="text-ash-500">({formatFileSize(file.size)})</span>
            </span>
            <Button size="sm" variant="ghost" onClick={() => handleFileChange(null)}>
              Quitar
            </Button>
          </div>
        )}
      </div>
      <div className="mt-6 flex justify-end">
        <Button disabled={!file || submitting} onClick={() => setConfirmOpen(true)}>
          {submitting ? "Enviando…" : t("submit")}
        </Button>
      </div>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} title="¿Enviar este archivo como tu examen final?">
        <p className="text-ash-600">
          Estás a punto de enviar <strong>{file?.name}</strong> como tu respuesta final. No podrás cambiarlo después — quedará pendiente de
          calificación por tu docente.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "…" : "Sí, enviar"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function QuestionFieldset({
  question,
  answers,
  setAnswers,
}: {
  question: AssessmentQuestion;
  answers: Record<string, unknown>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
}) {
  return (
    <fieldset className="rounded-lg border border-paper-border bg-paper p-6">
      <legend className="font-medium text-ink-900">{question.text}</legend>
      <div className="mt-4 flex flex-col gap-2">
        {question.type === "TRUE_FALSE" && (
          <>
            {[
              { id: "true", text: "Verdadero" },
              { id: "false", text: "Falso" },
            ].map((opt) => (
              <label key={opt.id} className="flex items-center gap-2 rounded-md border border-paper-border p-3 text-sm hover:bg-paper-muted">
                <input
                  type="radio"
                  name={question.id}
                  checked={answers[question.id] === opt.id}
                  onChange={() => setAnswers((a) => ({ ...a, [question.id]: opt.id }))}
                />
                {opt.text}
              </label>
            ))}
          </>
        )}
        {(question.type === "SINGLE_CHOICE" || question.type === "MULTI_CHOICE") &&
          question.options?.map((opt) => (
            <label key={opt.id} className="flex items-center gap-2 rounded-md border border-paper-border p-3 text-sm hover:bg-paper-muted">
              <input
                type={question.type === "SINGLE_CHOICE" ? "radio" : "checkbox"}
                name={question.id}
                checked={
                  question.type === "SINGLE_CHOICE"
                    ? answers[question.id] === opt.id
                    : Array.isArray(answers[question.id]) && (answers[question.id] as string[]).includes(opt.id)
                }
                onChange={() => {
                  if (question.type === "SINGLE_CHOICE") {
                    setAnswers((a) => ({ ...a, [question.id]: opt.id }));
                  } else {
                    setAnswers((a) => {
                      const prev = Array.isArray(a[question.id]) ? (a[question.id] as string[]) : [];
                      const next = prev.includes(opt.id) ? prev.filter((x) => x !== opt.id) : [...prev, opt.id];
                      return { ...a, [question.id]: next };
                    });
                  }
                }}
              />
              {opt.text}
            </label>
          ))}
        {question.type === "ORDERING" && question.options && (
          <OrderingField question={question} answers={answers} setAnswers={setAnswers} />
        )}
        {(question.type === "SHORT_ANSWER" || question.type === "OPEN") && (
          <textarea
            className="min-h-[6rem] w-full rounded-md border border-paper-border p-3 text-sm"
            value={(answers[question.id] as string) ?? ""}
            onChange={(e) => setAnswers((a) => ({ ...a, [question.id]: e.target.value }))}
          />
        )}
      </div>
    </fieldset>
  );
}

export function AssessmentRunner({ assessment }: { assessment: AssessmentDefinition }) {
  if (assessment.isFileUpload) return <FileUploadRunner assessment={assessment} />;
  return <QuestionBasedRunner assessment={assessment} />;
}

function QuestionBasedRunner({ assessment }: { assessment: AssessmentDefinition }) {
  const t = useTranslations("campus.assessment");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<{ score: number | null; status: string; pendingReviewCount: number; attemptsUsed?: number; maxAttempts?: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const attemptIdRef = useRef<string>(`mock-attempt-${assessment.id}`);

  const totalSeconds = (assessment.timeLimitMinutes ?? 0) * 60;
  const [remaining, setRemaining] = useState(totalSeconds);

  useEffect(() => {
    assessmentApi
      .createAttempt(assessment.id)
      .then((attempt) => {
        if (attempt?.id) attemptIdRef.current = attempt.id;
      })
      .catch(() => {
        // continuamos con el id simulado si la API no responde
      });
  }, [assessment.id]);

  useEffect(() => {
    if (!assessment.timeLimitMinutes || result) return;
    const interval = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(interval);
          void submit();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const question = assessment.questions[current];
  const minutes = String(Math.floor(remaining / 60)).padStart(2, "0");
  const seconds = String(remaining % 60).padStart(2, "0");

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        answers: Object.entries(answers).map(([questionId, response]) => ({ questionId, response })),
      };
      const res = await assessmentApi.submit(attemptIdRef.current, payload);
      setResult(res);
    } catch (err) {
      // Antes, cualquier falla que no fuera un ApiError con status real
      // (p.ej. sin conexión) fabricaba un resultado "PASSED" con nota 82 en
      // silencio — el alumno creía haber aprobado sin que la evaluación
      // hubiera llegado siquiera al servidor. Ahora siempre se muestra el
      // error real y se preservan las respuestas para reintentar.
      setError(err instanceof ApiError ? err.message : t("submitError"));
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  }

  if (result) {
    // "Si el alumno obtuvo la nota mínima y el admin permite más de un
    // intento, ¿podría volver a rendir para sacar mejor nota?" — sí, la
    // nota final del curso se queda con el mejor intento (ver
    // course-score.ts); antes no había ninguna forma de saberlo ni de
    // reintentar sin salir y volver a entrar a mano.
    const attemptsRemaining =
      result.maxAttempts !== undefined && result.attemptsUsed !== undefined ? result.maxAttempts - result.attemptsUsed : undefined;
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-paper-border bg-paper p-8 text-center shadow-card">
        <h1 className="font-serif text-2xl font-semibold text-ink-900">{t("resultTitle")}</h1>
        <p className="mt-4 text-lg font-medium text-ink-800">
          {result.status === "PASSED" ? t("passed") : result.status === "FAILED" ? t("failed") : t("pendingReview")}
        </p>
        {result.score !== null && <p className="mt-2 text-ash-600">{t("score", { score: result.score })}</p>}
        {result.pendingReviewCount > 0 && (
          <Callout variant="warning" className="mt-4 text-left">
            {t("pendingReview")}
          </Callout>
        )}
        {attemptsRemaining !== undefined && (
          <div className="mt-6 border-t border-paper-border pt-6">
            <p className="text-sm text-ash-500">
              Intentos usados: {result.attemptsUsed} de {result.maxAttempts}
            </p>
            {attemptsRemaining > 0 ? (
              <Button variant="outline" className="mt-3" onClick={() => window.location.reload()}>
                Reintentar examen ({attemptsRemaining} restante{attemptsRemaining === 1 ? "" : "s"})
              </Button>
            ) : (
              <p className="mt-2 text-xs text-ash-400">Usaste todos tus intentos disponibles.</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-serif text-xl font-semibold text-ink-900">{assessment.title}</h1>
        {assessment.timeLimitMinutes && (
          <div className="flex items-center gap-1.5 text-sm font-medium text-ink-800" role="timer" aria-live="polite">
            <Clock className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{t("timeRemaining")}:</span>
            {minutes}:{seconds}
          </div>
        )}
      </div>

      {error && <Callout variant="danger" className="mb-4">{error}</Callout>}

      {assessment.displayMode === "ALL_AT_ONCE" ? (
        // Todas las preguntas juntas en una sola pantalla — a diferencia del
        // modo por defecto (una por una, sin poder volver atrás una vez
        // enviada), acá el alumno puede revisar y corregir cualquier
        // respuesta antes de enviar todo junto.
        <div className="flex flex-col gap-6">
          {assessment.questions.map((q, idx) => (
            <div key={q.id}>
              <p className="mb-2 text-sm text-ash-500">{t("questionOf", { current: idx + 1, total: assessment.questions.length })}</p>
              <QuestionFieldset question={q} answers={answers} setAnswers={setAnswers} />
            </div>
          ))}
          <div className="flex justify-end">
            <Button onClick={() => setConfirmOpen(true)}>{t("submit")}</Button>
          </div>
        </div>
      ) : (
        <>
          <p className="mb-2 text-sm text-ash-500">{t("questionOf", { current: current + 1, total: assessment.questions.length })}</p>

          <QuestionFieldset question={question} answers={answers} setAnswers={setAnswers} />

          <div className="mt-6 flex justify-between">
            <Button variant="ghost" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)}>
              Anterior
            </Button>
            {current < assessment.questions.length - 1 ? (
              <Button onClick={() => setCurrent((c) => c + 1)}>Siguiente</Button>
            ) : (
              <Button onClick={() => setConfirmOpen(true)}>{t("submit")}</Button>
            )}
          </div>
        </>
      )}

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} title={t("confirmSubmitTitle")}>
        <p className="text-ash-600">{t("confirmSubmitBody")}</p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "…" : t("confirmSubmit")}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

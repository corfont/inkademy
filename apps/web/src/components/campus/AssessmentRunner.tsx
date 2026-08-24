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
  type: "SINGLE_CHOICE" | "MULTI_CHOICE" | "TRUE_FALSE" | "SHORT_ANSWER" | "OPEN";
  text: string;
  options?: { id: string; text: string }[];
}

export interface AssessmentDefinition {
  id: string;
  title: string;
  timeLimitMinutes: number | null;
  displayMode?: "ALL_AT_ONCE" | "ONE_BY_ONE";
  questions: AssessmentQuestion[];
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
  const t = useTranslations("campus.assessment");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<{ score: number | null; status: string; pendingReviewCount: number } | null>(null);
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

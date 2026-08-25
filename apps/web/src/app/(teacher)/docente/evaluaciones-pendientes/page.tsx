import type { Metadata } from "next";
import { FileWarning } from "lucide-react";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { localize, formatDate } from "@/lib/format";
import { GradeAnswerDialog } from "@/components/admin/GradeAnswerDialog";
import { GradeFileAttemptDialog } from "@/components/admin/GradeFileAttemptDialog";
import { Callout } from "@/components/ui/Callout";

export const metadata: Metadata = { title: "Evaluaciones pendientes (docente)" };

interface PendingAnswer {
  attemptId: string;
  answerId: string;
  studentName: string;
  courseTitle: string;
  questionText: string;
  studentAnswer: string;
}

/**
 * Misma fuente que /admin/evaluaciones-pendientes (GET /admin/attempts/
 * pending-review) — el backend ya acota la cola a solo los cursos de este
 * docente cuando el rol es TEACHER (ver AssessmentService.listPendingReview).
 */
function normalizePending(raw: any): PendingAnswer {
  const student = raw.attempt.user;
  const course = raw.attempt.assessment?.course;
  return {
    attemptId: raw.attempt.id,
    answerId: raw.id,
    studentName: student.displayName ?? [student.firstName, student.lastName].filter(Boolean).join(" "),
    courseTitle: localize(course?.title, "es", "—"),
    questionText: localize(raw.question?.text, "es", ""),
    studentAnswer: typeof raw.response === "string" ? raw.response : JSON.stringify(raw.response),
  };
}

export default async function TeacherPendingReviewPage() {
  const accessToken = getServerAccessToken();
  const { data: rawPending, live } = await withFallback(() => adminApi.pendingReview(accessToken), [] as any[]);
  const pending = rawPending.map(normalizePending);
  const { data: fileReviews } = await withFallback(() => adminApi.pendingFileReviews(accessToken), [] as any[]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">Evaluaciones pendientes</h1>
      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      {pending.length === 0 ? (
        <p className="text-ash-500">No tienes respuestas pendientes por calificar.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {pending.map((item) => (
            <div key={item.answerId} className="flex flex-col gap-3 rounded-lg border border-paper-border bg-paper p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-ink-900">{item.studentName}</p>
                  <p className="text-sm text-ash-500">{item.courseTitle}</p>
                </div>
                <GradeAnswerDialog
                  attemptId={item.attemptId}
                  answerId={item.answerId}
                  questionText={item.questionText}
                  studentAnswer={item.studentAnswer}
                />
              </div>
              <p className="text-sm text-ash-600">{item.questionText}</p>
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center gap-2">
          <FileWarning className="h-5 w-5 text-warning" aria-hidden="true" />
          <h2 className="font-serif text-xl font-semibold text-ink-900">Exámenes de archivo pendientes</h2>
        </div>
        {fileReviews.length === 0 ? (
          <p className="text-ash-500">Ningún examen de archivo pendiente por ahora.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {fileReviews.map((item: any) => (
              <div key={item.attemptId} className="flex items-center justify-between gap-3 rounded-lg border border-paper-border bg-paper p-5">
                <div>
                  <p className="font-medium text-ink-900">{item.userName}</p>
                  <p className="text-sm text-ash-500">
                    {localize(item.courseTitle, "es", "—")} — {localize(item.assessmentTitle, "es", "")}
                  </p>
                  <p className="text-xs text-ash-400">
                    Enviado {item.submittedAt ? formatDate(item.submittedAt, "es") : "—"}
                    {item.daysSincePending > 0 && ` — ${item.daysSincePending} día(s) de atraso`}
                  </p>
                </div>
                <GradeFileAttemptDialog
                  attemptId={item.attemptId}
                  studentName={item.userName}
                  submissionUrl={item.submissionUrl}
                  submissionMimeType={item.submissionMimeType}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

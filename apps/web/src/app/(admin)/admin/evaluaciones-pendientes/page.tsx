import type { Metadata } from "next";
import { ShieldAlert, FileWarning } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { localize, formatDate } from "@/lib/format";
import { GradeAnswerDialog } from "@/components/admin/GradeAnswerDialog";
import { GradeFileAttemptDialog } from "@/components/admin/GradeFileAttemptDialog";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Evaluaciones pendientes" };

interface PendingAnswer {
  attemptId: string;
  answerId: string;
  studentName: string;
  courseTitle: string;
  questionText: string;
  studentAnswer: string;
}

const MOCK_PENDING: PendingAnswer[] = [
  { attemptId: "att1", answerId: "ans1", studentName: "Renzo Palacios", courseTitle: "Marketing digital B2B", questionText: "Describe una estrategia de generación de demanda B2B.", studentAnswer: "Usaría contenido educativo dirigido a los tomadores de decisión, combinado con seguimiento comercial personalizado…" },
  { attemptId: "att2", answerId: "ans2", studentName: "Diana Chávez", courseTitle: "Gestión de proyectos ágiles", questionText: "¿Cómo priorizarías el backlog de un proyecto con recursos limitados?", studentAnswer: "Priorizaría por valor de negocio y esfuerzo, usando una matriz simple y revisándola cada sprint." },
];

/**
 * `GET /admin/attempts/pending-review` devuelve filas `Answer` crudas de
 * Prisma con `question`, `attempt.user`, `attempt.assessment.course`
 * incluidos (ver `AssessmentService.listPendingReview`), no el shape plano
 * que usa esta tabla — se adapta aquí.
 */
function normalizePending(raw: any): PendingAnswer {
  if (raw?.attemptId !== undefined && raw?.studentName !== undefined) return raw as PendingAnswer;
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

interface SuspiciousAttempt {
  attemptId: string;
  studentName: string;
  courseTitle: string;
  score: number | null;
  durationSeconds: number | null;
  expectedMinSeconds: number;
  submittedAt: string | null;
}

function normalizeSuspicious(raw: any): SuspiciousAttempt {
  const student = raw.user;
  const course = raw.assessment?.course;
  const questionsCount: number = raw.assessment?.questions?.length ?? 0;
  return {
    attemptId: raw.id,
    studentName: student?.displayName ?? [student?.firstName, student?.lastName].filter(Boolean).join(" "),
    courseTitle: localize(course?.title, "es", "—"),
    score: raw.score,
    durationSeconds: raw.durationSeconds,
    expectedMinSeconds: questionsCount * 20,
    submittedAt: raw.submittedAt,
  };
}

function formatDuration(seconds: number | null) {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export default async function PendingReviewPage() {
  const t = await getTranslations("admin.pendingReview");
  const accessToken = getServerAccessToken();

  const { data: rawPending, live } = await withFallback(() => adminApi.pendingReview(accessToken), MOCK_PENDING);
  const pending = rawPending.map(normalizePending);

  const { data: rawSuspicious } = await withFallback(() => adminApi.suspiciousAttempts(accessToken), []);
  const suspicious = rawSuspicious.map(normalizeSuspicious);

  const { data: fileReviews } = await withFallback(() => adminApi.pendingFileReviews(accessToken), [] as any[]);
  const { data: workload } = await withFallback(() => adminApi.teacherGradingWorkload(accessToken), [] as any[]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">{t("title")}</h1>
        {!live && <Callout variant="info" className="mt-4">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}
      </div>

      {workload.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <h2 className="mb-3 font-serif text-lg font-semibold text-ink-900">Carga de calificación por docente</h2>
            <p className="mb-3 text-sm text-ash-500">Para monitorear qué docentes tienen calificaciones acumuladas y cuánto atraso llevan.</p>
            <div className="overflow-x-auto rounded-lg border border-paper-border">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-paper-border text-ash-500">
                  <tr>
                    <th className="p-3 font-medium">Docente</th>
                    <th className="p-3 font-medium">Preguntas abiertas</th>
                    <th className="p-3 font-medium">Exámenes de archivo</th>
                    <th className="p-3 font-medium">Total pendiente</th>
                    <th className="p-3 font-medium">Atraso promedio</th>
                    <th className="p-3 font-medium">Atraso máximo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-paper-border">
                  {workload.map((w: any) => (
                    <tr key={w.teacherId}>
                      <td className="p-3 font-medium text-ink-900">{w.teacherName}</td>
                      <td className="p-3 text-ash-600">{w.pendingOpenAnswers}</td>
                      <td className="p-3 text-ash-600">{w.pendingFileReviews}</td>
                      <td className="p-3">
                        <Badge variant={w.totalPending > 5 ? "danger" : w.totalPending > 0 ? "warning" : "outline"}>{w.totalPending}</Badge>
                      </td>
                      <td className="p-3 text-ash-600">{w.avgDelayDays} día(s)</td>
                      <td className="p-3 text-ash-600">{w.maxDelayDays} día(s)</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {pending.length === 0 ? (
        <p className="text-ash-500">{t("empty")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {pending.map((item: PendingAnswer) => (
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
          <h2 className="font-serif text-xl font-semibold text-ink-900">Exámenes de archivo pendientes de calificar</h2>
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

      <div>
        <div className="mb-3 flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-danger" aria-hidden="true" />
          <h2 className="font-serif text-xl font-semibold text-ink-900">Intentos sospechosos</h2>
        </div>
        <p className="mb-4 text-sm text-ash-500">
          Aprobó con nota alta en un tiempo muy por debajo de lo esperado para leer y pensar el examen — no es una
          acusación automática, revisa caso por caso antes de tomar cualquier acción.
        </p>
        {suspicious.length === 0 ? (
          <p className="text-ash-500">Ningún intento marcado por ahora.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-paper-border bg-paper">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-paper-border text-ash-500">
                <tr>
                  <th className="p-3 font-medium">Alumno</th>
                  <th className="p-3 font-medium">Curso</th>
                  <th className="p-3 font-medium">Nota</th>
                  <th className="p-3 font-medium">Tiempo usado</th>
                  <th className="p-3 font-medium">Mínimo esperado</th>
                  <th className="p-3 font-medium">Enviado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-paper-border">
                {suspicious.map((s) => (
                  <tr key={s.attemptId}>
                    <td className="p-3 font-medium text-ink-900">{s.studentName}</td>
                    <td className="p-3 text-ash-600">{s.courseTitle}</td>
                    <td className="p-3">
                      <Badge variant="danger">{s.score?.toFixed(1)}%</Badge>
                    </td>
                    <td className="p-3 text-ash-600">{formatDuration(s.durationSeconds)}</td>
                    <td className="p-3 text-ash-600">{formatDuration(s.expectedMinSeconds)}</td>
                    <td className="p-3 text-ash-600">{s.submittedAt ? formatDate(s.submittedAt, "es") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

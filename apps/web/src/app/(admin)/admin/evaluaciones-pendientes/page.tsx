import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { localize } from "@/lib/format";
import { GradeAnswerDialog } from "@/components/admin/GradeAnswerDialog";
import { Callout } from "@/components/ui/Callout";

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

export default async function PendingReviewPage() {
  const t = await getTranslations("admin.pendingReview");
  const accessToken = getServerAccessToken();

  const { data: rawPending, live } = await withFallback(() => adminApi.pendingReview(accessToken), MOCK_PENDING);
  const pending = rawPending.map(normalizePending);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">{t("title")}</h1>
      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

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
    </div>
  );
}

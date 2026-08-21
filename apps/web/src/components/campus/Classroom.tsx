"use client";

import { useMemo, useRef, useState, type SyntheticEvent } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, FileText, PlayCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ClassroomDetail } from "@/lib/mock-data";
import { meApi } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { cn } from "@/lib/cn";

export function Classroom({ detail }: { detail: ClassroomDetail }) {
  const t = useTranslations("campus.classroom");
  const allLessons = useMemo(() => detail.modules.flatMap((m) => m.lessons), [detail]);
  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>(
    Object.fromEntries(allLessons.map((l) => [l.id, l.completed])),
  );
  const [currentId, setCurrentId] = useState(allLessons.find((l) => !l.completed)?.id ?? allLessons[0]?.id);
  const current = allLessons.find((l) => l.id === currentId) ?? allLessons[0];
  const lastSentRef = useRef(0);

  async function persistProgress(lessonId: string, patch: { completed?: boolean; lastPositionSeconds?: number }) {
    try {
      await meApi.updateLessonProgress(lessonId, patch);
    } catch {
      // best-effort: si la API no está disponible, el estado local sigue reflejando el intento del alumno
    }
  }

  function markComplete(lessonId: string) {
    setCompletedMap((m) => ({ ...m, [lessonId]: true }));
    persistProgress(lessonId, { completed: true });
  }

  function onTimeUpdate(e: SyntheticEvent<HTMLVideoElement>) {
    const seconds = Math.floor(e.currentTarget.currentTime);
    if (seconds - lastSentRef.current >= 10) {
      lastSentRef.current = seconds;
      persistProgress(current.id, { lastPositionSeconds: seconds });
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-6">
        <div>
          {current?.contentType === "VIDEO" ? (
            <video
              key={current.id}
              controls
              className="w-full rounded-lg bg-ink-950"
              src={current.videoUrl}
              onTimeUpdate={onTimeUpdate}
              onEnded={() => markComplete(current.id)}
            >
              <track kind="captions" />
            </video>
          ) : (
            <div className="flex flex-col items-center gap-4 rounded-lg border border-paper-border bg-paper p-10 text-center">
              <FileText className="h-10 w-10 text-ink-700" aria-hidden="true" />
              <p className="font-medium text-ink-900">{current?.title}</p>
              {detail.assessmentId && (
                <Link href={`/campus/cursos/${detail.enrollmentId}/evaluacion/${detail.assessmentId}`}>
                  <Button>{t("goToAssessment")}</Button>
                </Link>
              )}
            </div>
          )}
          <div className="mt-3 flex items-center justify-between">
            <h1 className="font-serif text-xl font-semibold text-ink-900">{current?.title}</h1>
            {!completedMap[current?.id ?? ""] ? (
              <Button size="sm" variant="outline" onClick={() => current && markComplete(current.id)}>
                {t("markComplete")}
              </Button>
            ) : (
              <span className="flex items-center gap-1.5 text-sm font-medium text-success">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                {t("completed")}
              </span>
            )}
          </div>
        </div>

        {current?.materials && current.materials.length > 0 && (
          <section>
            <h2 className="mb-2 font-serif text-lg font-semibold text-ink-900">{t("materials")}</h2>
            <ul className="flex flex-col gap-2">
              {current.materials.map((mat) => (
                <li key={mat.id}>
                  <a href={mat.url} className="flex items-center gap-2 text-sm text-ink-700 hover:underline">
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    {mat.title}
                    <span className="sr-only">({t("downloadMaterial")})</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="missing-heading" className="rounded-lg border border-paper-border bg-paper p-5">
          <h2 id="missing-heading" className="font-serif text-lg font-semibold text-ink-900">
            {t("missingToApprove")}
          </h2>
          {detail.approvalMissing.length === 0 ? (
            <Callout variant="success" className="mt-3">
              Cumples todos los requisitos de aprobación.
            </Callout>
          ) : (
            <ul className="mt-3 list-inside list-disc text-sm text-ash-700">
              {detail.approvalMissing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside>
        <h2 className="mb-3 font-serif text-lg font-semibold text-ink-900">{t("modules")}</h2>
        <div className="flex flex-col gap-4">
          {detail.modules.map((mod) => (
            <div key={mod.id}>
              <p className="mb-2 text-sm font-semibold text-ash-700">{mod.title}</p>
              <ul className="flex flex-col gap-1">
                {mod.lessons.map((lesson) => {
                  const isCurrent = lesson.id === currentId;
                  const isComplete = completedMap[lesson.id];
                  return (
                    <li key={lesson.id}>
                      <button
                        type="button"
                        onClick={() => setCurrentId(lesson.id)}
                        aria-current={isCurrent ? "true" : undefined}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm",
                          isCurrent ? "bg-ink-50 text-ink-800" : "text-ash-700 hover:bg-paper-muted",
                        )}
                      >
                        {isComplete ? (
                          <CheckCircle2 className="h-4 w-4 flex-none text-success" aria-hidden="true" />
                        ) : lesson.contentType === "VIDEO" ? (
                          <PlayCircle className="h-4 w-4 flex-none text-ash-400" aria-hidden="true" />
                        ) : (
                          <Circle className="h-4 w-4 flex-none text-ash-400" aria-hidden="true" />
                        )}
                        <span className="flex-1">{lesson.title}</span>
                        {lesson.durationMinutes && <span className="text-xs text-ash-400">{lesson.durationMinutes}′</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

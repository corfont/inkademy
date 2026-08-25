"use client";

import { useMemo, useRef, useState, type SyntheticEvent } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, Circle, FileDown, FileText, PlayCircle, ShieldAlert } from "lucide-react";
import type { ClassroomDetail, ClassroomMaterial } from "@/lib/mock-data";
import { meApi } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { cn } from "@/lib/cn";
import { localize, formatDate } from "@/lib/format";

function MaterialList({ heading, materials }: { heading: string; materials: ClassroomMaterial[] }) {
  if (materials.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ash-500">{heading}</p>
      <ul className="flex flex-col gap-2">
        {materials.map((mat) => (
          <li key={mat.id}>
            <a href={mat.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-ink-700 hover:underline">
              <FileText className="h-4 w-4 flex-none" aria-hidden="true" />
              {mat.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Classroom({ detail }: { detail: ClassroomDetail }) {
  const t = useTranslations("campus.classroom");
  const locale = useLocale();
  const allLessons = useMemo(() => detail.modules.flatMap((m) => m.lessons), [detail]);
  // El bloqueo real ya lo aplicó la API (accessBlocked viene calculado, y
  // `modules` llega vacío) — acá solo se explica por qué no hay contenido
  // en vez de mostrar un aula vacía sin ningún mensaje.
  if (detail.accessBlocked) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-lg border border-danger bg-danger-bg p-10 text-center">
        <ShieldAlert className="h-10 w-10 text-danger" aria-hidden="true" />
        <h1 className="font-serif text-xl font-semibold text-ink-900">Tu acceso a este curso venció</h1>
        <p className="text-sm text-ash-700">
          {detail.accessExpiresAt
            ? `El plazo para completar este curso era hasta el ${formatDate(detail.accessExpiresAt, locale)}. `
            : ""}
          Ya no puedes ver el contenido ni obtener el certificado. Si necesitas más tiempo, escribe a soporte para pedir una ampliación de
          plazo — es una excepción que puede autorizar un administrador.
        </p>
        <Link href="/campus/soporte">
          <Button>Contactar a soporte</Button>
        </Link>
      </div>
    );
  }
  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>(
    Object.fromEntries(allLessons.map((l) => [l.id, l.completed])),
  );
  const [currentId, setCurrentId] = useState(allLessons.find((l) => !l.completed)?.id ?? allLessons[0]?.id);
  const current = allLessons.find((l) => l.id === currentId) ?? allLessons[0];
  const currentModule = detail.modules.find((m) => m.lessons.some((l) => l.id === current?.id));
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

  const lessonMaterials = current?.materials ?? [];
  const lessonMain = lessonMaterials.filter((m) => m.category !== "SUPPLEMENTARY");
  const lessonSupplementary = lessonMaterials.filter((m) => m.category === "SUPPLEMENTARY");
  const moduleMaterials = currentModule?.materials ?? [];
  const moduleMain = moduleMaterials.filter((m) => m.category !== "SUPPLEMENTARY");
  const moduleSupplementary = moduleMaterials.filter((m) => m.category === "SUPPLEMENTARY");
  const hasAnyMaterials = lessonMaterials.length > 0 || moduleMaterials.length > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="flex flex-col gap-6">
        {detail.accessExpiresAt && (
          <Callout variant="warning">Debes terminar este curso antes del {formatDate(detail.accessExpiresAt, locale)} para conservar el acceso y poder certificarte.</Callout>
        )}
        {detail.syllabusUrl && (
          <a href={detail.syllabusUrl} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5">
              <FileDown className="h-4 w-4" aria-hidden="true" />
              Descargar sílabo del curso
            </Button>
          </a>
        )}

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
              <p className="font-medium text-ink-900">{localize(current?.title, locale)}</p>
              {detail.assessmentId && (
                <Link href={`/campus/cursos/${detail.enrollmentId}/evaluacion/${detail.assessmentId}`}>
                  <Button>{t("goToAssessment")}</Button>
                </Link>
              )}
            </div>
          )}
          <div className="mt-3 flex items-center justify-between">
            <h1 className="font-serif text-xl font-semibold text-ink-900">{localize(current?.title, locale)}</h1>
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

        {hasAnyMaterials && (
          <section className="flex flex-col gap-4">
            <h2 className="font-serif text-lg font-semibold text-ink-900">{t("materials")}</h2>
            <MaterialList heading="De esta lección" materials={lessonMain} />
            <MaterialList heading="Lecturas principales del módulo" materials={moduleMain} />
            <MaterialList heading="Lecturas complementarias" materials={[...lessonSupplementary, ...moduleSupplementary]} />
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
              <p className="mb-2 text-sm font-semibold text-ash-700">{localize(mod.title, locale)}</p>
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
                        <span className="flex-1">{localize(lesson.title, locale)}</span>
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

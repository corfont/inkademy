"use client";

import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, Circle, FileDown, FileText, PlayCircle, ShieldAlert } from "lucide-react";
import type { ClassroomDetail, ClassroomMaterial } from "@/lib/mock-data";
import { meApi } from "@/lib/api-client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { cn } from "@/lib/cn";
import { localize, formatDate } from "@/lib/format";

/**
 * "El sistema no debe permitir descargar la clase principal... alguna
 * protección contra captura de pantalla" — ningún navegador puede impedir
 * una grabación de pantalla real (eso requeriría DRM completo, EME/
 * Widevine, con un pipeline de streaming propio — fuera de alcance). Esto
 * es la mitigación real que SÍ se puede dar sin esa inversión: un
 * watermark con el correo del alumno, semitransparente y que cambia de
 * posición cada pocos segundos (para que no sea trivial recortarlo en
 * edición) — si el video termina compartido, se sabe de qué cuenta salió.
 */
function VideoWatermark({ label }: { label: string }) {
  const POSITIONS = [
    { top: "8%", left: "6%" },
    { top: "8%", left: "70%" },
    { top: "80%", left: "6%" },
    { top: "80%", left: "70%" },
    { top: "44%", left: "38%" },
  ];
  const [posIndex, setPosIndex] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setPosIndex((i) => (i + 1) % POSITIONS.length), 7000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute select-none rounded bg-black/20 px-2 py-1 text-xs font-medium text-white/70 backdrop-blur-[1px] transition-all duration-1000"
      style={POSITIONS[posIndex]}
    >
      {label}
    </div>
  );
}

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
  const { user } = useAuth();
  const watermarkLabel = user?.email ?? "";
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
  // "El administrador debe indicar si ese video inicia el curso" — si hay
  // una lección marcada como iniciadora, es la primera que ve el alumno al
  // entrar, sin importar el orden real de los módulos/lecciones.
  const [currentId, setCurrentId] = useState(
    allLessons.find((l) => l.isCourseStarter)?.id ?? allLessons.find((l) => !l.completed)?.id ?? allLessons[0]?.id,
  );
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

  // "Si es un PPT/Word/Excel con el que debe iniciar, se debe abrir de
  // manera automática cuando le dé clic" — para una lección que no es
  // video, si su material principal es un office doc, se embebe directo
  // con el visor de Office Online en vez de solo dejarlo como un link a
  // abrir aparte (funciona con cualquier URL pública, sin instalar nada).
  const officeMaterial = lessonMain.find((m) => ["slide", "doc", "sheet"].includes(m.kind));
  const officeViewerUrl = officeMaterial ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(officeMaterial.url)}` : null;

  // Notas del alumno — por lección, sincronizadas con el backend
  // (LessonNote) para que no se pierdan al limpiar el navegador ni queden
  // atadas a un solo dispositivo. Se guarda con debounce (1.2s de
  // inactividad) para no disparar un PATCH por cada tecla.
  const [notes, setNotes] = useState("");
  const [notesSaved, setNotesSaved] = useState(true);
  const notesSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!current) return;
    setNotesSaved(true);
    meApi
      .lessonNote(current.id)
      .then((r) => setNotes(r.content))
      .catch(() => setNotes(""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);
  function handleNotesChange(value: string) {
    setNotes(value);
    setNotesSaved(false);
    if (!current) return;
    if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current);
    notesSaveTimer.current = setTimeout(() => {
      meApi.saveLessonNote(current.id, value).then(() => setNotesSaved(true)).catch(() => {});
    }, 1200);
  }

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

        <div className="grid gap-4 lg:grid-cols-[1fr_16rem]">
          <div>
            {current?.contentType === "VIDEO" ? (
              <div className="relative overflow-hidden rounded-lg">
                <video
                  key={current.id}
                  controls
                  // "El sistema no debe permitir que el usuario pueda descargar
                  // la clase [principal]" — sin botón de descarga del
                  // reproductor nativo y sin menú de clic derecho. Es un
                  // disuasivo razonable, no una protección real contra
                  // captura de pantalla (ningún navegador lo permite sin DRM).
                  controlsList={detail.blockMainVideoDownload !== false ? "nodownload" : undefined}
                  onContextMenu={(e) => detail.blockMainVideoDownload !== false && e.preventDefault()}
                  className="w-full bg-ink-950"
                  src={current.videoUrl}
                  onTimeUpdate={onTimeUpdate}
                  onEnded={() => markComplete(current.id)}
                >
                  {current.subtitlesUrl ? (
                    <track kind="captions" label="Español" srcLang="es" src={current.subtitlesUrl} default />
                  ) : (
                    <track kind="captions" />
                  )}
                </video>
                {detail.blockMainVideoDownload !== false && watermarkLabel && <VideoWatermark label={watermarkLabel} />}
              </div>
            ) : officeViewerUrl ? (
              <iframe title={officeMaterial?.title} src={officeViewerUrl} className="h-[32rem] w-full rounded-lg border border-paper-border" />
            ) : (
              <div className="flex flex-col items-center gap-4 rounded-lg border border-paper-border bg-paper p-10 text-center">
                <FileText className="h-10 w-10 text-ink-700" aria-hidden="true" />
                <p className="font-medium text-ink-900">{localize(current?.title, locale)}</p>
                {detail.assessmentId &&
                  (detail.assessmentUnlocked ? (
                    <Link href={`/campus/cursos/${detail.enrollmentId}/evaluacion/${detail.assessmentId}`}>
                      <Button>{t("goToAssessment")}</Button>
                    </Link>
                  ) : (
                    <p className="text-sm text-ash-500">
                      La evaluación se habilita al completar el 100% del curso (llevas {Math.round(detail.progressPct ?? 0)}%).
                    </p>
                  ))}
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

          {/* "Al costado podrá tomar notas si quisiera" — sincronizadas con
              el backend (LessonNote), no solo en este navegador. */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="lesson-notes" className="text-xs font-semibold uppercase tracking-wide text-ash-500">
                Mis notas
              </label>
              <span className="text-xs text-ash-400">{notesSaved ? "Guardado" : "Guardando…"}</span>
            </div>
            <textarea
              id="lesson-notes"
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Escribe tus notas de esta lección…"
              className="min-h-[20rem] w-full flex-1 resize-none rounded-lg border border-paper-border bg-paper p-3 text-sm"
            />
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

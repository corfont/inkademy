"use client";

import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Award, CheckCircle2, Circle, ClipboardCheck, ExternalLink, FileDown, FileText, HelpCircle, PlayCircle, ShieldAlert, XCircle } from "lucide-react";
import type { ClassroomDetail, ClassroomMaterial, FormativeQuiz, FormativeQuizQuestion } from "@/lib/mock-data";
import { meApi, API_URL } from "@/lib/api-client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { RequirementChecklist } from "@/components/ui/RequirementChecklist";
import { ActionSection } from "./ActionSection";
import { CourseRatingPrompt } from "./CourseRatingPrompt";
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

/**
 * "Cursos e-learning interactivos con evaluación formativa integrada" —
 * autoevaluación dentro de la lección misma, con feedback inmediato (correcto
 * / incorrecto + explicación). A propósito NO se guarda ningún intento ni se
 * envía nada al backend: es formativa (para que el alumno se autoevalúe),
 * nunca cuenta para la nota o el certificado — eso lo sigue haciendo la
 * evaluación normal (Assessment/ApprovalRule).
 */
function FormativeQuizWidget({ quiz }: { quiz: FormativeQuiz }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});

  return (
    <div className="mt-6 flex flex-col gap-4 rounded-lg border border-paper-border bg-paper p-5">
      <div className="flex items-center gap-2">
        <HelpCircle className="h-5 w-5 text-brand-600" aria-hidden="true" />
        <h2 className="font-serif text-base font-semibold text-ink-900">Ponte a prueba</h2>
      </div>
      <p className="-mt-2 text-xs text-ash-500">
        Autoevaluación de esta lección — no afecta tu nota ni el certificado, es solo para que veas si lo estás entendiendo.
      </p>
      {quiz.questions.map((q, qIdx) => {
        const selected = answers[q.id];
        const answered = selected !== undefined;
        const isCorrect = answered && selected === q.correctIndex;
        return (
          <div key={q.id} className="flex flex-col gap-2 border-t border-paper-border pt-4 first:border-t-0 first:pt-0">
            <p className="text-sm font-medium text-ink-900">
              {qIdx + 1}. {q.text}
            </p>
            <div className="flex flex-col gap-1.5">
              {q.options.map((option, oIdx) => {
                const isSelected = selected === oIdx;
                const showAsCorrect = answered && oIdx === q.correctIndex;
                const showAsWrong = answered && isSelected && oIdx !== q.correctIndex;
                return (
                  <button
                    key={oIdx}
                    type="button"
                    disabled={answered}
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: oIdx }))}
                    className={cn(
                      "flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors",
                      !answered && "border-paper-border hover:border-brand-400 hover:bg-brand-50",
                      showAsCorrect && "border-success bg-success-bg text-success",
                      showAsWrong && "border-danger bg-danger-bg text-danger",
                      answered && !showAsCorrect && !showAsWrong && "border-paper-border text-ash-500",
                    )}
                  >
                    <span>{option}</span>
                    {showAsCorrect && <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
                    {showAsWrong && <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            {answered && (
              <div className="flex items-start gap-2 rounded-md bg-paper-muted p-3 text-xs text-ash-600">
                <span className="font-medium">{isCorrect ? "¡Correcto!" : "No es la respuesta correcta."}</span>
                {q.explanation && <span>{q.explanation}</span>}
                <button
                  type="button"
                  className="ml-auto shrink-0 font-medium text-brand-600 hover:underline"
                  onClick={() => setAnswers((a) => { const next = { ...a }; delete next[q.id]; return next; })}
                >
                  Reintentar
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * "Al llegar al segundo disparo: pausar, bloquear los controles y desplegar
 * un overlay con la pregunta correspondiente de forma síncrona. El modal no
 * puede cerrarse con Esc ni clic fuera." — cubre todo el reproductor
 * (position:absolute inset-0), sin botón de cierre ni onClick de fondo; la
 * única salida es responder (ver continueAfterCheckpoint en Classroom).
 * Mismo criterio formativo que FormativeQuizWidget: muestra si acertó o no
 * + la explicación antes de dejar continuar, no fuerza la respuesta
 * correcta (no es un examen).
 */
function VideoCheckpointOverlay({ question, onContinue }: { question: FormativeQuizQuestion; onContinue: () => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const answered = selected !== null;
  const isCorrect = answered && selected === question.correctIndex;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="absolute inset-0 z-10 flex items-center justify-center bg-ink-950/90 p-6"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex w-full max-w-md flex-col gap-4 rounded-lg bg-paper p-6 shadow-raised">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-indigo-600" aria-hidden="true" />
          <p className="text-xs font-semibold uppercase tracking-wide text-ash-500">Pausa para verificar</p>
        </div>
        <p className="text-sm font-medium text-ink-900">{question.text}</p>
        <div className="flex flex-col gap-1.5">
          {question.options.map((option, oIdx) => {
            const isSelected = selected === oIdx;
            const showAsCorrect = answered && oIdx === question.correctIndex;
            const showAsWrong = answered && isSelected && oIdx !== question.correctIndex;
            return (
              <button
                key={oIdx}
                type="button"
                disabled={answered}
                onClick={() => setSelected(oIdx)}
                className={cn(
                  "flex items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  !answered && "border-paper-border hover:border-indigo-400 hover:bg-indigo-50",
                  showAsCorrect && "border-success bg-success-bg text-success",
                  showAsWrong && "border-danger bg-danger-bg text-danger",
                  answered && !showAsCorrect && !showAsWrong && "border-paper-border text-ash-500",
                )}
              >
                <span>{option}</span>
                {showAsCorrect && <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
                {showAsWrong && <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        {answered && (
          <div className="flex flex-col gap-3 rounded-md bg-paper-muted p-3 text-xs text-ash-600">
            <div>
              <span className="font-medium">{isCorrect ? "¡Correcto!" : "No era la respuesta correcta."}</span>
              {question.explanation && <span> {question.explanation}</span>}
            </div>
            <Button size="sm" onClick={onContinue} className="self-end">
              Continuar viendo
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * "Me gustaría implementar módulos SCORM" — el paquete se reproduce en un
 * iframe apuntando a la página envoltorio del backend (ver ScormController/
 * scorm-shim.ts), que expone la API SCORM que el paquete necesita para
 * reportar avance/nota. El token de sesión se pide recién al abrir la
 * lección (no viaja en el HTML de esta página) y es de alcance acotado —
 * solo sirve para reproducir ESTA lección durante unas horas.
 *
 * `sandbox`: allow-scripts + allow-same-origin es la combinación mínima
 * necesaria para que el contenido encuentre `window.parent.API` (sin
 * allow-same-origin el iframe queda forzado a un origen único aleatorio,
 * rompiendo el descubrimiento de la API aunque la URL sea la misma) — no se
 * agrega allow-top-navigation ni allow-popups-to-escape-sandbox, así que el
 * paquete no puede navegar ni redirigir la pestaña del alumno.
 */
function ScormPlayer({ enrollmentId, lessonId }: { enrollmentId: string; lessonId: string }) {
  const [playerUrl, setPlayerUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPlayerUrl(null);
    setError(null);
    meApi
      .scormSession(enrollmentId, lessonId)
      .then((session) => {
        if (!cancelled) setPlayerUrl(`${API_URL}${session.playerUrl}`);
      })
      .catch(() => {
        if (!cancelled) setError("No pudimos iniciar el contenido SCORM. Intenta recargar la página.");
      });
    return () => {
      cancelled = true;
    };
  }, [enrollmentId, lessonId]);

  if (error) return <Callout variant="danger">{error}</Callout>;
  if (!playerUrl) return <div className="flex h-[32rem] items-center justify-center rounded-lg border border-paper-border bg-paper text-sm text-ash-500">Cargando contenido…</div>;
  return (
    <iframe
      src={playerUrl}
      title="Contenido SCORM"
      className="h-[32rem] w-full rounded-lg border border-paper-border bg-ink-950"
      sandbox="allow-scripts allow-same-origin allow-forms"
    />
  );
}

function MaterialList({
  heading,
  materials,
  readMap,
  onMarkRead,
}: {
  heading: string;
  materials: ClassroomMaterial[];
  readMap?: Record<string, boolean>;
  onMarkRead?: (materialId: string) => void;
}) {
  if (materials.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ash-500">{heading}</p>
      <ul className="flex flex-col gap-2">
        {materials.map((mat) => {
          // "Marcar si el material puede descargarse, visualizarse, o
          // ambos" — sin permiso de descarga se fuerza `download` (nunca
          // abre una vista previa que el alumno pueda guardar con un clic
          // extra); sin permiso de vista se omite `target="_blank"` para
          // que el navegador guarde el archivo en vez de previsualizarlo.
          // No es DRM real (mismo límite honesto que blockMainVideoDownload),
          // solo el mejor esfuerzo sin construir un visor propio.
          const allowDownload = mat.allowDownload !== false;
          const allowView = mat.allowView !== false;
          const linkProps = allowView
            ? { target: "_blank", rel: "noreferrer" }
            : { download: true }; // solo descarga: fuerza guardar en vez de previsualizar
          const isRead = readMap?.[mat.id] ?? false;
          return (
            <li key={mat.id} className="flex items-center justify-between gap-3">
              <a href={mat.url} {...linkProps} className="flex items-center gap-2 text-sm text-ink-700 hover:underline">
                <FileText className="h-4 w-4 flex-none" aria-hidden="true" />
                {mat.title}
                {!allowDownload && <span className="text-xs text-ash-400">(solo vista)</span>}
              </a>
              {/* "Si un curso tiene lecturas principales el alumno deberá
                  marcar como leído para que el sistema entienda que ha leído
                  ese documento; para las complementarias no" — el toggle solo
                  se pasa (onMarkRead) para materiales MAIN. */}
              {onMarkRead &&
                (isRead ? (
                  <span className="flex flex-none items-center gap-1 text-xs font-medium text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Leído
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onMarkRead(mat.id)}
                    className="flex-none rounded-full border border-paper-border px-2.5 py-1 text-xs font-medium text-ash-600 hover:border-ink-400 hover:text-ink-900"
                  >
                    Marcar como leído
                  </button>
                ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Classroom({ detail }: { detail: ClassroomDetail }) {
  const t = useTranslations("campus.classroom");
  const locale = useLocale();
  const router = useRouter();
  const { user } = useAuth();
  // "Si no responde [las estrellas] el curso no se podrá dar por finalizado
  // y el certificado no se podrá emitir" — el modal aparece solo cuando el
  // curso ya cumple todo lo demás (readyForRatingPrompt) y aún no calificó.
  const [ratingOpen, setRatingOpen] = useState(false);
  useEffect(() => {
    setRatingOpen(Boolean(detail.readyForRatingPrompt) && !detail.myRating);
  }, [detail.readyForRatingPrompt, detail.myRating]);
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
  // "El alumno deberá marcar como leído" — recopila TODAS las lecturas
  // principales (de lecciones y de módulos) para poder mostrar "Leído" ya
  // marcado desde el inicio, sin esperar a que el alumno abra cada lección.
  const allMainMaterials = useMemo(
    () => [
      ...detail.modules.flatMap((m) => m.lessons.flatMap((l) => l.materials)),
      ...detail.modules.flatMap((m) => m.materials),
    ].filter((m) => m.category !== "SUPPLEMENTARY"),
    [detail],
  );
  const [readMap, setReadMap] = useState<Record<string, boolean>>(
    Object.fromEntries(allMainMaterials.map((m) => [m.id, m.read ?? false])),
  );
  const [progressPct, setProgressPct] = useState(detail.progressPct ?? 0);
  // "El administrador debe indicar si ese video inicia el curso" — si hay
  // una lección marcada como iniciadora, es la primera que ve el alumno al
  // entrar, sin importar el orden real de los módulos/lecciones.
  const [currentId, setCurrentId] = useState(
    allLessons.find((l) => l.isCourseStarter)?.id ?? allLessons.find((l) => !l.completed)?.id ?? allLessons[0]?.id,
  );
  const current = allLessons.find((l) => l.id === currentId) ?? allLessons[0];
  const currentModule = detail.modules.find((m) => m.lessons.some((l) => l.id === current?.id));
  const lastSentRef = useRef(0);

  // "Interacciones sobre un video: bloquear el avance, pausar y mostrar la
  // pregunta al llegar al segundo disparo" — checkpoints = preguntas del
  // formativeQuiz de la lección actual que tienen videoTimestampSeconds.
  // Se reinician al cambiar de lección (useEffect abajo).
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoCheckpoints = useMemo(
    () =>
      (current?.formativeQuiz?.questions ?? [])
        .filter((q): q is FormativeQuizQuestion & { videoTimestampSeconds: number } => q.videoTimestampSeconds != null)
        .sort((a, b) => a.videoTimestampSeconds - b.videoTimestampSeconds),
    [current?.id],
  );
  const nonCheckpointQuestions = (current?.formativeQuiz?.questions ?? []).filter((q) => q.videoTimestampSeconds == null);
  const [maxWatchedSeconds, setMaxWatchedSeconds] = useState(0);
  const [answeredCheckpoints, setAnsweredCheckpoints] = useState<Record<string, boolean>>({});
  const [activeCheckpoint, setActiveCheckpoint] = useState<FormativeQuizQuestion | null>(null);
  useEffect(() => {
    setMaxWatchedSeconds(current?.lastPositionSeconds ?? 0);
    setAnsweredCheckpoints({});
    setActiveCheckpoint(null);
  }, [current?.id]);

  // "Le he puesto que he leído el material obligatorio y no me ha aparecido
  // la pantalla para calificar" — persistProgress/markMaterialRead solo
  // actualizaban progressPct en estado local; `detail` (de donde sale
  // ratingOpen) se fetchea una sola vez al cargar la página y nunca se
  // volvía a leer, así que aunque el servidor ya marcara
  // readyForRatingPrompt=true el modal nunca se disparaba. Ahora ambas
  // llamadas también abren el modal directamente con la respuesta fresca,
  // sin depender de un refetch completo de la página.
  function maybeOpenRatingPrompt(readyForRatingPrompt: boolean | undefined) {
    if (readyForRatingPrompt && !detail.myRating) setRatingOpen(true);
  }

  async function persistProgress(lessonId: string, patch: { completed?: boolean; lastPositionSeconds?: number }) {
    try {
      const result = await meApi.updateLessonProgress(lessonId, patch);
      if (result?.progressPct !== undefined) setProgressPct(result.progressPct);
      maybeOpenRatingPrompt(result?.readyForRatingPrompt);
    } catch {
      // best-effort: si la API no está disponible, el estado local sigue reflejando el intento del alumno
    }
  }

  function markComplete(lessonId: string) {
    setCompletedMap((m) => ({ ...m, [lessonId]: true }));
    persistProgress(lessonId, { completed: true });
  }

  async function markMaterialRead(materialId: string) {
    setReadMap((m) => ({ ...m, [materialId]: true }));
    try {
      const result = await meApi.markMaterialRead(materialId);
      if (result?.progressPct !== undefined) setProgressPct(result.progressPct);
      maybeOpenRatingPrompt(result?.readyForRatingPrompt);
    } catch {
      setReadMap((m) => ({ ...m, [materialId]: false })); // revierte si la API falló
    }
  }

  function onTimeUpdate(e: SyntheticEvent<HTMLVideoElement>) {
    const seconds = Math.floor(e.currentTarget.currentTime);
    if (seconds - lastSentRef.current >= 10) {
      lastSentRef.current = seconds;
      persistProgress(current.id, { lastPositionSeconds: seconds });
    }
    if (!activeCheckpoint && seconds > maxWatchedSeconds) setMaxWatchedSeconds(seconds);
    const due = videoCheckpoints.find((q) => !answeredCheckpoints[q.id] && (q.videoTimestampSeconds ?? 0) <= e.currentTarget.currentTime);
    if (due) {
      e.currentTarget.pause();
      setActiveCheckpoint(due);
    }
  }

  // "Bloquear los clics hacia adelante en la barra de progreso: el usuario
  // solo puede pausar, retroceder o reproducir el tiempo ya visto" — se
  // detecta con onSeeking (dispara ANTES de que el navegador termine de
  // saltar) y se fuerza de vuelta a lo ya visto. No es infalible contra un
  // usuario decidido con devtools (ningún <video> nativo lo es sin DRM
  // real), pero sí bloquea el uso normal de la barra de progreso.
  function onSeeking(e: SyntheticEvent<HTMLVideoElement>) {
    if (e.currentTarget.currentTime > maxWatchedSeconds + 1) {
      e.currentTarget.currentTime = maxWatchedSeconds;
    }
  }

  // Responder (bien o mal) desbloquea seguir viendo — mismo criterio
  // formativo que FormativeQuizWidget: se muestra si acertó o no + la
  // explicación, y recién ahí el alumno decide seguir. No es un examen, es
  // un chequeo de comprensión; forzar la respuesta correcta para avanzar
  // volvería esto punitivo, distinto al resto de "evaluación formativa".
  function continueAfterCheckpoint(question: FormativeQuizQuestion) {
    setAnsweredCheckpoints((m) => ({ ...m, [question.id]: true }));
    setActiveCheckpoint(null);
    videoRef.current?.play();
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
      <CourseRatingPrompt
        enrollmentId={detail.enrollmentId}
        open={ratingOpen}
        onClose={() => setRatingOpen(false)}
        onSubmitted={() => {
          setRatingOpen(false);
          router.refresh();
        }}
      />
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
                  ref={videoRef}
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
                  onSeeking={onSeeking}
                  onEnded={() => markComplete(current.id)}
                >
                  {current.subtitlesUrl ? (
                    <track kind="captions" label="Español" srcLang="es" src={current.subtitlesUrl} default />
                  ) : (
                    <track kind="captions" />
                  )}
                </video>
                {detail.blockMainVideoDownload !== false && watermarkLabel && <VideoWatermark label={watermarkLabel} />}
                {activeCheckpoint && <VideoCheckpointOverlay question={activeCheckpoint} onContinue={() => continueAfterCheckpoint(activeCheckpoint)} />}
              </div>
            ) : current?.contentType === "LINK" && current.externalUrl ? (
              // "Pongo un link... no funciona" — antes contentType=LINK no
              // tenía ningún campo para la URL ni ninguna forma de abrirla;
              // un enlace externo no se puede autoejecutar (los navegadores
              // bloquean pestañas/redirecciones sin que el alumno haga clic
              // primero), así que el CTA claro es lo más "automático" posible.
              <div className="flex flex-col items-center gap-4 rounded-lg border border-paper-border bg-paper p-10 text-center">
                <ExternalLink className="h-10 w-10 text-ink-700" aria-hidden="true" />
                <p className="font-medium text-ink-900">{localize(current.title, locale)}</p>
                {/* "Se puede abrir dentro de esa misma ventana en vez de una
                    pestaña nueva" — sin target="_blank": navega la misma
                    pestaña (la mayoría de sitios externos bloquean ser
                    embebidos en un iframe vía X-Frame-Options/CSP, así que
                    no se puede "incrustar" dentro del aula; esto es lo más
                    cercano a "misma ventana" que un sitio ajeno permite). */}
                <a href={current.externalUrl} onClick={() => markComplete(current.id)}>
                  <Button>Abrir enlace</Button>
                </a>
              </div>
            ) : current?.contentType === "SCORM" ? (
              <ScormPlayer key={current.id} enrollmentId={detail.enrollmentId} lessonId={current.id} />
            ) : officeViewerUrl ? (
              <iframe title={officeMaterial?.title} src={officeViewerUrl} className="h-[32rem] w-full rounded-lg border border-paper-border" />
            ) : (
              <div className="flex flex-col items-center gap-4 rounded-lg border border-paper-border bg-paper p-10 text-center">
                <FileText className="h-10 w-10 text-ink-700" aria-hidden="true" />
                <p className="font-medium text-ink-900">{localize(current?.title, locale)}</p>
                {/* El o los enlaces a las evaluaciones ahora viven en una
                    sección propia y siempre visible más abajo — ver
                    "Evaluaciones" (no depende de qué lección esté abierta,
                    ni se pierden las evaluaciones adicionales de un curso
                    con más de un examen ponderado). */}
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
            {/* Las preguntas con videoTimestampSeconds ya se muestran como
                overlay bloqueante al llegar a su segundo — no se repiten acá. */}
            {nonCheckpointQuestions.length > 0 && <FormativeQuizWidget quiz={{ questions: nonCheckpointQuestions }} />}
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
            <MaterialList heading="De esta lección" materials={lessonMain} readMap={readMap} onMarkRead={markMaterialRead} />
            <MaterialList heading="Lecturas principales del módulo" materials={moduleMain} readMap={readMap} onMarkRead={markMaterialRead} />
            <MaterialList heading="Lecturas complementarias" materials={[...lessonSupplementary, ...moduleSupplementary]} />
          </section>
        )}

        {/* "No puedo entrar al curso... para completar lo que me falta" —
            antes solo se enlazaba UNA evaluación (la primera), y solo
            aparecía si la lección abierta no tenía video/link/SCORM. Ahora
            se listan TODAS las evaluaciones reales del curso, siempre
            visibles, cada una con su propio candado, peso y mejor nota. */}
        {detail.assessments.length > 0 && (() => {
          const allPassed = detail.assessments.every((a) => a.bestScore !== null && a.bestScore >= a.minScore);
          return (
            <ActionSection
              icon={ClipboardCheck}
              tone={detail.assessmentsUnlocked && allPassed ? "success" : "ink"}
              instruction={
                !detail.assessmentsUnlocked
                  ? "Aprueba tus evaluaciones para avanzar"
                  : allPassed
                    ? "Ya aprobaste todas tus evaluaciones"
                    : "Aprueba tus evaluaciones para avanzar"
              }
              lockedReason={
                !detail.assessmentsUnlocked ? `Completes el 100% del curso (llevas ${Math.round(progressPct)}%).` : null
              }
            >
              <ul className="flex flex-col gap-3">
                {detail.assessments.map((a) => (
                  <li key={a.id} className="flex flex-col gap-1 rounded-md border border-paper-border p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-ink-900">{localize(a.title, locale)}</p>
                      <p className="text-xs text-ash-500">
                        {a.weightPercent ? `Pesa ${a.weightPercent}% de la nota final · ` : ""}
                        Nota mínima {a.minScore}/100
                        {a.bestScore !== null && ` · Tu mejor nota: ${a.bestScore}/100`}
                        {a.attemptsUsed > 0 && ` · Intentos usados: ${a.attemptsUsed}/${a.maxAttempts}`}
                      </p>
                    </div>
                    {detail.assessmentsUnlocked && (
                      <Link href={`/campus/cursos/${detail.enrollmentId}/evaluacion/${a.id}`}>
                        <Button size="sm">{a.bestScore !== null ? "Ver / reintentar" : t("goToAssessment")}</Button>
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </ActionSection>
          );
        })()}

        {/* Banner "Certificado" — nuevo: antes la descarga solo vivía en
            "Mis cursos" (fuera del aula); acá se explica, en la misma
            secuencia de acción que Evaluaciones, exactamente qué falta
            para desbloquearlo (o el botón de descarga directa si ya está listo). */}
        {detail.certificationIncluded && (
          <ActionSection
            icon={Award}
            tone={detail.certificateUrl ? "gold" : "ink"}
            instruction={detail.certificateUrl ? "Descarga tu certificado" : "Obtén tu certificado completando el curso"}
            lockedReason={!detail.certificateUrl ? (detail.approvalChecklist ?? []).find((c) => !c.done)?.label ?? null : null}
          >
            {detail.certificateUrl && (
              <a href={detail.certificateUrl} target="_blank" rel="noopener noreferrer" download>
                <Button size="sm">
                  <FileDown className="h-4 w-4" aria-hidden="true" /> Descargar certificado
                </Button>
              </a>
            )}
          </ActionSection>
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
            <div className="mt-3">
              <RequirementChecklist items={detail.approvalChecklist ?? detail.approvalMissing.map((label) => ({ label, done: false }))} />
            </div>
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

import { Clock, RotateCcw, Target, CalendarClock } from "lucide-react";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { Card, CardContent } from "@/components/ui/Card";
import { isCuratedFont, googleFontHref } from "@/lib/brand-fonts";
import { localize, formatDateTime } from "@/lib/format";

export interface ExamHeaderInfo {
  courseTitle?: Record<string, string> | null;
  title: Record<string, string>;
  titleFontFamily?: string | null;
  timeLimitMinutes?: number | null;
  maxAttempts?: number | null;
  attemptsUsed?: number | null;
  minScore?: number | null;
  availableFrom?: string | null;
  availableUntil?: string | null;
  headerText?: Record<string, string> | null;
  footerText?: Record<string, string> | null;
  instructionsText?: Record<string, string> | null;
}

function Fact({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-paper-muted px-3 py-2 text-sm">
      <Icon className="h-4 w-4 flex-none text-ink-700" aria-hidden="true" />
      <div>
        <p className="text-xs text-ash-500">{label}</p>
        <p className="font-medium text-ink-900">{value}</p>
      </div>
    </div>
  );
}

/**
 * "Debe manejar tipos de letra para el título, debe ponerse el logo, datos
 * del curso, duración, número de intentos y todo lo que necesite saber el
 * alumno antes de rendir el examen" — cabecera compartida entre la
 * previsualización del builder (admin) y la pantalla previa del alumno
 * (ExamStartScreen), para que ambas se vean IDÉNTICAS.
 */
export function ExamHeaderCard({ exam, locale, footer }: { exam: ExamHeaderInfo; locale: string; footer?: React.ReactNode }) {
  const titleText = localize(exam.title, locale, "Evaluación");
  const usesCustomFont = exam.titleFontFamily && isCuratedFont(exam.titleFontFamily);

  return (
    <Card>
      {usesCustomFont && <link rel="stylesheet" href={googleFontHref(exam.titleFontFamily as never)} />}
      <CardContent className="flex flex-col gap-5 p-6 sm:p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandLogo maxHeightPx={40} />
          {exam.courseTitle && <p className="text-sm font-medium uppercase tracking-wide text-ash-500">{localize(exam.courseTitle, locale)}</p>}
          <h1
            className="font-serif text-2xl font-semibold text-ink-900 sm:text-3xl"
            style={usesCustomFont ? { fontFamily: `"${exam.titleFontFamily}", var(--font-fraunces)` } : undefined}
          >
            {titleText}
          </h1>
        </div>

        {exam.headerText && <p className="whitespace-pre-line text-center text-sm text-ink-700">{localize(exam.headerText, locale)}</p>}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Fact icon={Clock} label="Duración" value={exam.timeLimitMinutes ? `${exam.timeLimitMinutes} min` : "Sin límite"} />
          <Fact
            icon={RotateCcw}
            label="Intentos"
            value={
              exam.attemptsUsed != null && exam.maxAttempts
                ? `${exam.attemptsUsed} de ${exam.maxAttempts} usados`
                : `${exam.maxAttempts ?? "—"} máximo`
            }
          />
          <Fact icon={Target} label="Nota mínima" value={exam.minScore != null ? `${exam.minScore}` : "—"} />
          {(exam.availableFrom || exam.availableUntil) && (
            <Fact
              icon={CalendarClock}
              label="Disponible"
              value={
                exam.availableUntil
                  ? `Hasta ${formatDateTime(exam.availableUntil, locale)}`
                  : exam.availableFrom
                    ? `Desde ${formatDateTime(exam.availableFrom, locale)}`
                    : "—"
              }
            />
          )}
        </div>

        {exam.instructionsText && (
          <div className="rounded-md border border-paper-border bg-paper-muted p-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ash-500">Instrucciones</p>
            <p className="whitespace-pre-line text-sm text-ink-800">{localize(exam.instructionsText, locale)}</p>
          </div>
        )}

        {footer}

        {exam.footerText && <p className="whitespace-pre-line text-center text-xs text-ash-500">{localize(exam.footerText, locale)}</p>}
      </CardContent>
    </Card>
  );
}

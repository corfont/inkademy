import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getTranslations, getLocale } from "next-intl/server";
import { meApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { MOCK_ENROLLMENTS } from "@/lib/mock-data";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Callout } from "@/components/ui/Callout";
import { CourseCard } from "@/components/catalog/CourseCard";
import { RetakeCourseButton } from "@/components/campus/RetakeCourseButton";
import { localize, formatDate } from "@/lib/format";
import type { EnrollmentSummaryDTO } from "@inkademy/shared";

export const metadata: Metadata = { title: "Mis cursos" };

function EnrollmentCard({
  enrollment,
  locale,
  t,
  attemptLabel,
}: {
  enrollment: EnrollmentSummaryDTO;
  locale: string;
  t: any;
  // "Por ejemplo he vuelto a hacer el curso... no debería seguir apareciendo
  // en ambas pestañas" — no era un bug de filtro (cada matrícula sale en UNA
  // sola pestaña, según su propio status), sino que dos tarjetas con el
  // MISMO título (la original ya Finalizada + la nueva de "volver a
  // llevar") no tenían ninguna forma de distinguirse entre sí. Cuando el
  // alumno tiene más de una matrícula al mismo curso, se marca cada
  // tarjeta con su intento y fecha.
  attemptLabel?: string | null;
}) {
  // "Debes terminar antes de..." — antes accessExpiresAt viajaba en el DTO
  // pero nada en pantalla se lo mostraba al alumno; el vencimiento era
  // invisible hasta que, sin aviso, dejaba de poder entrar al curso.
  const isExpired = enrollment.status === "EXPIRED" || (enrollment.accessExpiresAt && new Date(enrollment.accessExpiresAt) < new Date());
  // "Que el alumno vea bonito cada curso... con su imagen y demás cosas...
  // obviamente el precio, el descuento eso ya no vale porque ya está
  // comprado" — la tarjeta era puro texto (nunca mostró precio, pero
  // tampoco tenía ninguna imagen); ahora usa la misma miniatura de portada
  // que el catálogo (con el mismo respaldo de gradiente+inicial si el
  // curso no tiene imagen), sin agregar nada de precio/descuento.
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-4 p-0 sm:flex-row sm:items-stretch">
        <Link href={`/campus/cursos/${enrollment.id}`} className="block flex-none sm:w-48">
          {enrollment.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={enrollment.coverImageUrl} alt="" className="h-32 w-full object-cover sm:h-full" />
          ) : (
            <div
              className="flex h-32 w-full items-center justify-center bg-gradient-to-br from-ink-700 to-ink-900 text-paper sm:h-full"
              role="img"
              aria-label={localize(enrollment.title, locale)}
            >
              <span className="font-serif text-3xl font-semibold opacity-70">{localize(enrollment.title, locale).charAt(0)}</span>
            </div>
          )}
        </Link>

        <div className="flex flex-1 flex-col gap-4 p-6 pl-0 sm:flex-row sm:items-start sm:justify-between sm:pl-6">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="font-serif text-lg font-semibold text-ink-900">{localize(enrollment.title, locale)}</p>
              <Badge variant="outline">{enrollment.offeringKind === "PROGRAM" ? "Programa" : "Curso"}</Badge>
              {isExpired && <Badge variant="danger">Acceso vencido</Badge>}
            </div>
            {attemptLabel && <p className="mt-0.5 text-xs text-ash-500">{attemptLabel}</p>}
            {enrollment.accessExpiresAt && !isExpired && (
              <p className="mt-1 text-xs font-medium text-warning">Debes terminar antes del {formatDate(enrollment.accessExpiresAt, locale)}</p>
            )}
            {isExpired && (
              <p className="mt-1 text-xs text-danger">
                Tu acceso venció{enrollment.accessExpiresAt ? ` el ${formatDate(enrollment.accessExpiresAt, locale)}` : ""}. Escribe a soporte si
                necesitas una ampliación de plazo.
              </p>
            )}
            <ProgressBar value={enrollment.progressPct} label={t("progress", { pct: enrollment.progressPct })} className="mt-3 max-w-sm" />
            <p className="mt-1 text-sm text-ash-500">{t("progress", { pct: Math.round(enrollment.progressPct) })}</p>

            <div className="mt-3">
              {enrollment.approvalMissing.length > 0 ? (
                <>
                  <p className="text-sm font-medium text-ink-800">{t("missingTitle")}</p>
                  <ul className="mt-1 list-inside list-disc text-sm text-ash-600">
                    {enrollment.approvalMissing.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-success">{t("noMissing")}</p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <Link href={`/campus/cursos/${enrollment.id}`}>
              <Button size="sm">{enrollment.nextActionLabel ?? "Ver curso"}</Button>
            </Link>
            {enrollment.certificateAvailable && (
              <Link href="/campus/certificados" className="text-sm text-ink-700 hover:underline">
                Ver certificado
              </Link>
            )}
            {enrollment.status === "COMPLETED" && enrollment.offeringKind === "COURSE" && (
              <RetakeCourseButton enrollmentId={enrollment.id} />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function MyCoursesPage() {
  const t = await getTranslations("campus.courses");
  const locale = await getLocale();
  const accessToken = cookies().get(ACCESS_TOKEN_COOKIE)?.value ?? null;

  const [{ data: enrollments, live }, { data: saved }] = await Promise.all([
    withFallback(() => meApi.enrollments(undefined, accessToken), MOCK_ENROLLMENTS),
    withFallback(() => meApi.savedCourses(accessToken), []),
  ]);

  // "¿Cuál es la diferencia entre la pestaña En Progreso y Próximos?" —
  // antes las separaba solo progressPct===0 vs >0, sin ningún concepto real
  // de "curso que todavía no empieza" (fecha de cohorte, etc.) detrás — la
  // distinción confundía más de lo que ayudaba. Se fusionan en una sola
  // pestaña "En curso"; la barra de progreso de cada tarjeta ya deja claro
  // si un curso recién matriculado (0%) o a medias.
  const inProgress = enrollments.filter((e) => e.status === "ACTIVE");
  const completed = enrollments.filter((e) => e.status === "COMPLETED");

  // Cuenta cuántas matrículas activas+completadas tiene el alumno para un
  // mismo curso (offeringKind COURSE) — si hay más de una, cada tarjeta se
  // etiqueta con su número de intento y su fecha de matrícula.
  const attemptCounts = new Map<string, number>();
  for (const e of [...inProgress, ...completed]) {
    if (e.offeringKind !== "COURSE" || !e.courseId) continue;
    attemptCounts.set(e.courseId, (attemptCounts.get(e.courseId) ?? 0) + 1);
  }
  function attemptLabelFor(e: EnrollmentSummaryDTO): string | null {
    if (e.offeringKind !== "COURSE" || !e.courseId) return null;
    if ((attemptCounts.get(e.courseId) ?? 0) < 2) return null;
    const sameCourse = [...inProgress, ...completed]
      .filter((x) => x.courseId === e.courseId)
      .sort((a, b) => new Date(a.enrolledAt).getTime() - new Date(b.enrolledAt).getTime());
    const attemptNumber = sameCourse.findIndex((x) => x.id === e.id) + 1;
    return `Intento ${attemptNumber} · Matriculado el ${formatDate(e.enrolledAt, locale)}`;
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">{t("title")}</h1>
      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      <Tabs defaultValue="inProgress">
        <TabsList aria-label={t("title")}>
          <TabsTrigger value="inProgress">{t("inProgress")}</TabsTrigger>
          <TabsTrigger value="completed">{t("completed")}</TabsTrigger>
          <TabsTrigger value="saved">{t("saved")}</TabsTrigger>
        </TabsList>

        <TabsContent value="inProgress">
          <div className="flex flex-col gap-4">
            {inProgress.length === 0 ? (
              <p className="text-ash-500">{t("empty")}</p>
            ) : (
              inProgress.map((e) => <EnrollmentCard key={e.id} enrollment={e} locale={locale} t={t} attemptLabel={attemptLabelFor(e)} />)
            )}
          </div>
        </TabsContent>
        <TabsContent value="completed">
          <div className="flex flex-col gap-4">
            {completed.length === 0 ? (
              <p className="text-ash-500">{t("empty")}</p>
            ) : (
              completed.map((e) => <EnrollmentCard key={e.id} enrollment={e} locale={locale} t={t} attemptLabel={attemptLabelFor(e)} />)
            )}
          </div>
        </TabsContent>
        <TabsContent value="saved">
          {saved.length === 0 ? (
            <p className="text-ash-500">{t("savedEmpty")}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {saved.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

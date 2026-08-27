import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getTranslations, getLocale } from "next-intl/server";
import { meApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { MOCK_ENROLLMENTS } from "@/lib/mock-data";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Callout } from "@/components/ui/Callout";
import { CourseCard } from "@/components/catalog/CourseCard";
import { EnrollmentListFilterBar } from "@/components/campus/EnrollmentListFilterBar";
import { formatDate } from "@/lib/format";
import type { EnrollmentSummaryDTO } from "@inkademy/shared";

export const metadata: Metadata = { title: "Mis cursos" };

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
          <EnrollmentListFilterBar
            items={inProgress.map((e) => ({ enrollment: e, attemptLabel: attemptLabelFor(e) }))}
            locale={locale}
            emptyLabel={t("empty")}
          />
        </TabsContent>
        <TabsContent value="completed">
          <EnrollmentListFilterBar
            items={completed.map((e) => ({ enrollment: e, attemptLabel: attemptLabelFor(e) }))}
            locale={locale}
            emptyLabel={t("empty")}
          />
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

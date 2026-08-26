import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Clock, Radio, User, Star } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { catalogApi, meApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { MOCK_COURSE_DETAIL, MOCK_COURSES } from "@/lib/mock-data";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { localize, formatPrice, formatDateTime, formatDuration, MODALITY_LABEL, TYPE_LABEL, LEVEL_LABEL } from "@/lib/format";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const detail = await catalogApi.course(params.slug).catch(() => MOCK_COURSE_DETAIL[params.slug]);
  return { title: detail ? `${localize(detail.title, "es")} · Inkademy` : "Curso · Inkademy" };
}

export default async function CourseDetailPage({ params }: { params: { slug: string } }) {
  const locale = await getLocale();
  const t = await getTranslations("courseDetail");
  const tc = await getTranslations("common");
  const accessToken = getServerAccessToken();
  const isAuthenticated = Boolean(accessToken);

  const fallback = MOCK_COURSE_DETAIL[params.slug];
  const { data: course, live } = await withFallback(() => catalogApi.course(params.slug), fallback);

  if (!course) notFound();

  // Si el alumno ya tiene una matrícula (comprada, otorgada gratis, o vía
  // cupo B2B de su empresa) para este mismo curso, no debe volver a ver el
  // precio ni el botón de "Inscribirse" — antes se le seguía mostrando el
  // precio y un CTA que lo mandaba a /checkout aunque ya tuviera acceso
  // (riesgo real de pago duplicado, y el caso explícito que reportó el
  // admin: un trabajador con cupo pagado por su empresa no debería ver precio).
  let myEnrollment: { id: string } | null = null;
  if (isAuthenticated) {
    try {
      const mine = await meApi.enrollments(undefined, accessToken);
      const match = mine.find((e) => e.offeringKind === "COURSE" && e.courseId === course.id && e.status !== "CANCELLED" && e.status !== "EXPIRED");
      if (match) myEnrollment = { id: match.id };
    } catch {
      // si falla la consulta de matrículas, se degrada al comportamiento
      // anterior (mostrar precio) en vez de romper la página del curso.
    }
  }

  const accessLabel =
    course.accessDurationPolicy === "PERMANENT"
      ? t("accessPermanent")
      : course.accessDurationPolicy === "DAYS_30"
        ? t("access30Days")
        : t("access6Months");

  const related = MOCK_COURSES.filter((c) => course.nextRecommendedCourseIds?.includes(c.id));

  return (
    <div className="container py-10">
      {!live && (
        <Callout variant="info" className="mb-6">
          {tc("offlineNotice")}
        </Callout>
      )}

      <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
        <div>
          <div className="mb-4 flex flex-wrap gap-1.5">
            <Badge variant="ink">{MODALITY_LABEL[course.modality]?.[locale as "es" | "en"] ?? course.modality}</Badge>
            <Badge variant="outline">{TYPE_LABEL[course.type]?.[locale as "es" | "en"] ?? course.type}</Badge>
            <Badge variant="outline">{LEVEL_LABEL[course.level]?.[locale as "es" | "en"] ?? course.level}</Badge>
          </div>

          <h1 className="font-serif text-3xl font-semibold text-ink-900 sm:text-4xl">{localize(course.title, locale)}</h1>
          {course.subtitle && <p className="mt-3 text-lg text-ash-600">{localize(course.subtitle, locale)}</p>}

          {course.avgRating != null && (
            <div className="mt-2 flex items-center gap-1" aria-label={`${course.avgRating} de 5 estrellas, ${course.ratingsCount} reseñas`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} className={`h-4 w-4 ${n <= Math.round(course.avgRating!) ? "fill-warning text-warning" : "fill-none text-ash-300"}`} aria-hidden="true" />
              ))}
              <span className="text-sm font-medium text-ash-600">
                {course.avgRating.toFixed(1)} ({course.ratingsCount})
              </span>
            </div>
          )}

          <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ash-600">
            {course.teacherName && (
              <div className="flex items-center gap-1.5">
                <User className="h-4 w-4 text-ash-400" aria-hidden="true" />
                <span>
                  <dt className="sr-only">{t("teacherTitle")}</dt>
                  <dd>{course.teacherName}</dd>
                </span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-ash-400" aria-hidden="true" />
              <dd>{formatDuration(course.durationHours, course.durationUnit, locale as "es" | "en")}</dd>
            </div>
            {course.liveSessions?.[0] && (
              <div className="flex items-center gap-1.5">
                <Radio className="h-4 w-4 text-ash-400" aria-hidden="true" />
                <dd>
                  {t("nextSession")}: {formatDateTime(course.liveSessions[0].startsAt, locale, course.liveSessions[0].timezone)}
                </dd>
              </div>
            )}
          </dl>

          {course.description && (
            <section className="mt-8">
              <h2 className="font-serif text-xl font-semibold text-ink-900">{t("aboutCourse")}</h2>
              <p className="mt-3 max-w-prose text-ash-700">{localize(course.description, locale)}</p>
            </section>
          )}

          <section className="mt-10">
            <h2 className="font-serif text-xl font-semibold text-ink-900">{t("modules")}</h2>
            <div className="mt-4 divide-y divide-paper-border rounded-lg border border-paper-border">
              {course.modules.map((mod) => (
                <details key={mod.id} className="group p-4 open:bg-paper-muted/50">
                  <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-ink-900">
                    <span>{localize(mod.title, locale)}</span>
                    <span className="text-sm text-ash-500">{t("lessonsCount", { count: mod.lessons.length })}</span>
                  </summary>
                  <ul className="mt-3 flex flex-col gap-2 pl-1">
                    {mod.lessons.map((lesson) => (
                      <li key={lesson.id} className="flex items-center justify-between text-sm text-ash-600">
                        <span>{localize(lesson.title, locale)}</span>
                        <span className="flex items-center gap-2">
                          {lesson.isFreePreview && <Badge variant="gold">{t("freePreview")}</Badge>}
                          {lesson.durationMinutes && <span>{lesson.durationMinutes} min</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </section>

          {course.reviews && course.reviews.length > 0 && (
            <section className="mt-10">
              <h2 className="font-serif text-xl font-semibold text-ink-900">Reseñas de alumnos</h2>
              <div className="mt-4 flex flex-col gap-4">
                {course.reviews.slice(0, 10).map((r, i) => (
                  <div key={i} className="rounded-lg border border-paper-border p-4">
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star key={n} className={`h-3.5 w-3.5 ${n <= r.stars ? "fill-warning text-warning" : "fill-none text-ash-300"}`} aria-hidden="true" />
                      ))}
                    </div>
                    <p className="mt-2 text-sm text-ash-700">{r.comment}</p>
                    <p className="mt-2 text-xs font-medium text-ash-500">{r.authorName}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {related.length > 0 && (
            <section className="mt-10">
              <h2 className="font-serif text-xl font-semibold text-ink-900">{t("relatedPaths")}</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {related.map((r) => (
                  <li key={r.id}>
                    <Link href={`/cursos/${r.slug}`} className="text-ink-700 hover:underline">
                      {localize(r.title, locale)}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-lg border border-paper-border bg-paper p-6 shadow-card">
            <div className="flex items-center gap-2">
              <p className="text-sm text-ash-500">{t("priceLabel")}</p>
              {course.isOnSale && (
                <span className="rounded-full bg-danger px-2 py-0.5 text-xs font-semibold text-white">-{course.discountPercent}%</span>
              )}
            </div>
            {myEnrollment ? (
              <p className="mt-1 flex items-center gap-2 text-sm font-medium text-success">
                <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                Ya tienes acceso a este curso
              </p>
            ) : isAuthenticated ? (
              <>
                {course.isOnSale && course.originalPriceAmount && (
                  <p className="mt-1 text-sm text-ash-500 line-through">
                    {formatPrice(course.originalPriceAmount, course.priceCurrency, locale)}
                  </p>
                )}
                <p className={`font-serif text-3xl font-semibold ${course.isOnSale ? "text-danger" : "text-gold-600"}`}>
                  {formatPrice(course.priceAmount, course.priceCurrency, locale)}
                </p>
                {course.isOnSale && course.discountExpiresAt && (
                  <p className="text-xs text-ash-500">
                    Oferta válida hasta el {new Date(course.discountExpiresAt).toLocaleDateString(locale)}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1">
                <Link href={`/login?next=${encodeURIComponent(`/cursos/${course.slug}`)}`} className="font-medium text-ink-600 underline-offset-2 hover:underline">
                  {tc("loginToSeePrice")}
                </Link>
              </p>
            )}
            {course.certificationIncluded && (
              <p className="mt-3 flex items-center gap-2 text-sm text-success">
                <BadgeCheck className="h-4 w-4" aria-hidden="true" />
                {t("certificationIncluded")}
              </p>
            )}
            <p className="mt-2 text-sm text-ash-500">{accessLabel}</p>
            {myEnrollment ? (
              <Link href={`/campus/cursos/${myEnrollment.id}`} className="mt-5 block">
                <Button className="w-full" size="lg">
                  Ir al curso
                </Button>
              </Link>
            ) : (
              <Link href={`/checkout?courseId=${course.id}`} className="mt-5 block">
                <Button className="w-full" size="lg">
                  {tc("enroll")}
                </Button>
              </Link>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

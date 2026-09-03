import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, BookOpen, CalendarClock, Clock, GraduationCap, Globe2, Layers, Radio, Star, Target } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { catalogApi, meApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { MOCK_COURSE_DETAIL, MOCK_COURSES } from "@/lib/mock-data";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Avatar } from "@/components/ui/Avatar";
import { SaveCourseButton } from "@/components/marketing/SaveCourseButton";
import { localize, formatPrice, formatDateTime, formatDuration, MODALITY_LABEL, TYPE_LABEL, LEVEL_LABEL } from "@/lib/format";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const detail = await catalogApi.course(params.slug).catch(() => MOCK_COURSE_DETAIL[params.slug]);
  // Sin " · Inkademy" acá: el layout raíz ya aplica ese sufijo vía su
  // `template: "%s · Inkademy"` — agregarlo también acá duplicaba el
  // sufijo (confirmado en vivo: la pestaña mostraba "A curso · Inkademy · Inkademy").
  return { title: detail ? localize(detail.title, "es") : "Curso" };
}

// "Tal vez un curso diga a quién va dirigido, tal vez no" — palabras clave
// del título de la sección elegida por el admin deciden qué ícono usar, sin
// que el admin tenga que elegir uno a mano. Fallback razonable si no
// coincide con nada (Layers).
function sectionIcon(title: string) {
  const t = title.toLowerCase();
  if (t.includes("dirig") || t.includes("audiencia") || t.includes("perfil")) return GraduationCap;
  if (t.includes("requisit") || t.includes("prerrequ")) return BadgeCheck;
  if (t.includes("objetiv") || t.includes("aprender") || t.includes("logr")) return Target;
  return Layers;
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
  let isSaved = false;
  if (isAuthenticated) {
    try {
      const mine = await meApi.enrollments(undefined, accessToken);
      const match = mine.find((e) => e.offeringKind === "COURSE" && e.courseId === course.id && e.status !== "CANCELLED" && e.status !== "EXPIRED");
      if (match) myEnrollment = { id: match.id };
    } catch {
      // si falla la consulta de matrículas, se degrada al comportamiento
      // anterior (mostrar precio) en vez de romper la página del curso.
    }
    if (!myEnrollment) {
      isSaved = await meApi
        .isCourseSaved(course.id, accessToken)
        .then((r) => r.saved)
        .catch(() => false);
    }
  }

  // Antes esto era un ternario en cadena que trataba CUALQUIER valor que no
  // fuera PERMANENT/DAYS_30 como "6 meses" — con DAYS_7 recién agregado
  // (curso con acceso de 7 días) mostraba "Acceso por 6 meses", un dato
  // real incorrecto para el alumno. Un mapa explícito no puede caer en ese
  // mismo bug con el próximo valor que se agregue al enum.
  const ACCESS_LABEL_KEY: Record<string, string> = {
    PERMANENT: "accessPermanent",
    DAYS_7: "access7Days",
    DAYS_30: "access30Days",
    MONTHS_6: "access6Months",
  };
  const accessLabel = t(ACCESS_LABEL_KEY[course.accessDurationPolicy] ?? "access6Months");

  const related = MOCK_COURSES.filter((c) => course.nextRecommendedCourseIds?.includes(c.id));
  const totalLessons = course.modules.reduce((sum, m) => sum + m.lessons.length, 0);

  // "Iconos más modernos, tipografía y colores del manual de marca" —
  // recuadros de datos clave en vez de una lista de texto plano, con el
  // azul de marca (#586BD8 → indigo) como acento consistente.
  const keyFacts = [
    { icon: Layers, label: MODALITY_LABEL[course.modality]?.[locale as "es" | "en"] ?? course.modality },
    { icon: Clock, label: formatDuration(course.durationHours, course.durationUnit, locale as "es" | "en") },
    { icon: BookOpen, label: t("lessonsCount", { count: totalLessons }) },
    { icon: Globe2, label: course.language === "en" ? "Inglés" : course.language === "pt" ? "Portugués" : "Español" },
    ...(course.liveSessions?.[0]
      ? [{ icon: CalendarClock, label: formatDateTime(course.liveSessions[0].startsAt, locale, course.liveSessions[0].timezone) }]
      : []),
  ];

  return (
    <div>
      {!live && (
        <div className="container pt-6">
          <Callout variant="info">{tc("offlineNotice")}</Callout>
        </div>
      )}

      {/* Hero: imagen de portada si existe (antes nunca se mostraba en la
          ficha, solo en las tarjetas del catálogo) sobre un fondo con el
          azul de marca — si no hay imagen, el degradé solo ya se ve
          intencional, no como un hueco vacío. */}
      <section className="relative overflow-hidden border-b border-paper-border bg-ink-950">
        {course.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={course.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        )}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/90 via-ink-950/95 to-ink-950" />
        <div className="container relative py-14 sm:py-20">
          <div className="mb-4 flex flex-wrap gap-1.5">
            <Badge variant="gold">{TYPE_LABEL[course.type]?.[locale as "es" | "en"] ?? course.type}</Badge>
            <span className="inline-flex items-center rounded-full border border-white/20 px-2.5 py-0.5 text-xs font-medium text-white/80">
              {LEVEL_LABEL[course.level]?.[locale as "es" | "en"] ?? course.level}
            </span>
          </div>
          <h1 className="max-w-3xl font-serif text-3xl font-semibold text-white sm:text-4xl lg:text-5xl">{localize(course.title, locale)}</h1>
          {course.subtitle && <p className="mt-4 max-w-2xl text-lg text-indigo-100">{localize(course.subtitle, locale)}</p>}

          {course.avgRating != null && (
            <div className="mt-4 flex items-center gap-1.5" aria-label={`${course.avgRating} de 5 estrellas, ${course.ratingsCount} reseñas`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} className={`h-4 w-4 ${n <= Math.round(course.avgRating!) ? "fill-gold-400 text-gold-400" : "fill-none text-white/30"}`} aria-hidden="true" />
              ))}
              <span className="text-sm font-medium text-white/80">
                {course.avgRating.toFixed(1)} ({course.ratingsCount})
              </span>
            </div>
          )}

          {/* Recuadros de datos clave con ícono — reemplaza la lista de texto
              plano anterior; inspirado en fichas de curso de referencia
              (CFA Society) pero con la identidad visual propia. */}
          <dl className="mt-8 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
            {keyFacts.map((f, i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 backdrop-blur-sm">
                <f.icon className="h-4 w-4 shrink-0 text-gold-400" aria-hidden="true" />
                <dd className="text-sm font-medium text-white">{f.label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div className="container py-10">
        <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
          <div>
            {course.teacherName && (
              <div className="mb-8 flex items-center gap-3 rounded-lg border border-paper-border bg-paper p-4">
                <Avatar name={course.teacherName} />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-ash-500">{t("teacherTitle")}</p>
                  <p className="font-medium text-ink-900">{course.teacherName}</p>
                </div>
              </div>
            )}

            {course.description && (
              <section>
                <h2 className="font-serif text-xl font-semibold text-ink-900">{t("aboutCourse")}</h2>
                <p className="mt-3 max-w-prose whitespace-pre-line text-ash-700">{localize(course.description, locale)}</p>
              </section>
            )}

            {/* Secciones libres del admin ("a quién va dirigido", "requisitos
                mínimos", o lo que decida agregar) — solo aparecen si el
                admin las creó para ESTE curso. */}
            {course.detailSections && course.detailSections.length > 0 && (
              <div className="mt-10 grid gap-4 sm:grid-cols-2">
                {course.detailSections.map((sec) => {
                  const Icon = sectionIcon(localize(sec.title, locale));
                  return (
                    <div key={sec.id} className="rounded-lg border border-paper-border bg-paper p-5">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <h3 className="font-serif text-base font-semibold text-ink-900">{localize(sec.title, locale)}</h3>
                      </div>
                      <p className="mt-3 whitespace-pre-line text-sm text-ash-700">{localize(sec.body, locale)}</p>
                    </div>
                  );
                })}
              </div>
            )}

            <section className="mt-10">
              <h2 className="font-serif text-xl font-semibold text-ink-900">{t("modules")}</h2>
              <div className="mt-4 divide-y divide-paper-border overflow-hidden rounded-lg border border-paper-border">
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

            {course.certificationIncluded && (
              <section className="mt-10 flex items-start gap-3 rounded-lg border border-gold-200 bg-gold-50 p-5">
                <BadgeCheck className="h-6 w-6 shrink-0 text-gold-600" aria-hidden="true" />
                <div>
                  <h3 className="font-serif text-base font-semibold text-ink-900">{t("certificationIncluded")}</h3>
                  <p className="mt-1 text-sm text-ash-700">
                    Al completar el curso y cumplir los requisitos de aprobación, recibes un certificado verificable con código único.
                  </p>
                </div>
              </section>
            )}

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
            <div className="overflow-hidden rounded-xl border border-paper-border bg-paper shadow-raised">
              <div className="h-1.5 bg-gradient-to-r from-indigo-500 to-gold-400" />
              <div className="p-6">
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
                    <p className={`font-serif text-3xl font-semibold ${course.isOnSale ? "text-danger" : "text-indigo-700"}`}>
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
                    <Link href={`/login?next=${encodeURIComponent(`/cursos/${course.slug}`)}`} className="font-medium text-indigo-600 underline-offset-2 hover:underline">
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
                  <>
                    <Link href={`/checkout?courseId=${course.id}`} className="mt-5 block">
                      <Button className="w-full" size="lg">
                        {tc("enroll")}
                      </Button>
                    </Link>
                    {isAuthenticated && <SaveCourseButton courseId={course.id} initialSaved={isSaved} />}
                  </>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

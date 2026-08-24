import Link from "next/link";
import { GraduationCap, Building2 } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { catalogApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { MOCK_AREAS, MOCK_SECTIONS } from "@/lib/mock-data";
import { SearchBox } from "@/components/catalog/SearchBox";
import { SectionCarousel } from "@/components/catalog/SectionCarousel";
import { Callout } from "@/components/ui/Callout";
import { localize } from "@/lib/format";

export default async function HomePage() {
  const t = await getTranslations("home");
  const tc = await getTranslations("common");
  const locale = await getLocale();

  const [{ data: areas }, { data: sections, live }] = await Promise.all([
    withFallback(() => catalogApi.areas(), MOCK_AREAS),
    withFallback(() => catalogApi.sections(), MOCK_SECTIONS),
  ]);

  return (
    <>
      <section className="border-b border-paper-border bg-gradient-to-b from-paper-muted to-paper py-16 sm:py-24">
        <div className="container flex flex-col items-center text-center">
          <h1 className="brand-gradient-text max-w-3xl font-serif text-4xl font-semibold leading-tight sm:text-5xl">
            {t("heroTitle")}
          </h1>
          <p className="mt-4 max-w-xl text-lg text-ash-600">{t("heroSubtitle")}</p>
          <SearchBox className="mt-8 w-full max-w-xl" />

          {!live && (
            <Callout variant="info" className="mt-6 max-w-xl text-left">
              {tc("offlineNotice")}
            </Callout>
          )}
        </div>

        <div className="container mt-14 grid gap-6 sm:grid-cols-2">
          <Link
            href="/catalogo"
            className="group flex flex-col justify-between rounded-lg border border-paper-border bg-paper p-8 shadow-card transition-shadow hover:shadow-raised"
          >
            <GraduationCap className="h-8 w-8 text-gold-500" aria-hidden="true" />
            <div className="mt-4">
              <h2 className="font-serif text-2xl font-semibold text-ink-900">{t("splitB2CTitle")}</h2>
              <p className="mt-2 text-ash-600">{t("splitB2CBody")}</p>
              <span className="mt-4 inline-block font-medium text-ink-700 group-hover:underline">{t("splitB2CCta")} →</span>
            </div>
          </Link>
          <Link
            href="/empresas"
            className="group flex flex-col justify-between rounded-lg border border-paper-border bg-ink-900 p-8 text-paper shadow-card transition-shadow hover:shadow-raised"
          >
            <Building2 className="h-8 w-8 text-gold-400" aria-hidden="true" />
            <div className="mt-4">
              <h2 className="font-serif text-2xl font-semibold">{t("splitB2BTitle")}</h2>
              <p className="mt-2 text-ink-100">{t("splitB2BBody")}</p>
              <span className="mt-4 inline-block font-medium text-gold-300 group-hover:underline">{t("splitB2BCta")} →</span>
            </div>
          </Link>
        </div>
      </section>

      <section className="py-12">
        <div className="container">
          <h2 className="mb-6 font-serif text-2xl font-semibold text-ink-900">{t("areasTitle")}</h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {areas.map((area) => (
              <li key={area.id}>
                <Link
                  href={`/catalogo?areaSlug=${area.slug}`}
                  className="flex h-full items-center justify-center rounded-md border border-paper-border bg-paper-muted p-4 text-center text-sm font-medium text-ink-800 transition-colors hover:bg-ink-50"
                >
                  {localize(area.name, locale)}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <SectionCarousel title={t("featuredTitle")} courses={sections.featured} viewAllHref="/catalogo" viewAllLabel={tc("viewAll")} />
      <SectionCarousel
        title={t("upcomingLiveTitle")}
        courses={sections.upcomingLive}
        viewAllHref="/catalogo?liveOnly=true"
        viewAllLabel={tc("viewAll")}
        className="bg-paper-muted"
      />
      <SectionCarousel title={t("newTitle")} courses={sections.new} viewAllHref="/catalogo" viewAllLabel={tc("viewAll")} />
      <SectionCarousel
        title={t("pathsTitle")}
        courses={sections.recommendedPaths}
        viewAllHref="/catalogo"
        viewAllLabel={tc("viewAll")}
        className="bg-paper-muted"
      />
      <SectionCarousel title={t("mostDemandedTitle")} courses={sections.mostDemanded} viewAllHref="/catalogo" viewAllLabel={tc("viewAll")} />
    </>
  );
}

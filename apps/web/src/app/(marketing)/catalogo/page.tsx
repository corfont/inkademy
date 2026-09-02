import type { Metadata } from "next";
import { Suspense } from "react";
import type { CatalogFilters, CourseCardDTO } from "@inkademy/shared";
import { getTranslations } from "next-intl/server";
import { catalogApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { MOCK_AREAS, MOCK_COURSES } from "@/lib/mock-data";
import { FilterBar } from "@/components/catalog/FilterBar";
import { SortSelect } from "@/components/catalog/SortSelect";
import { CourseCard } from "@/components/catalog/CourseCard";
import { Callout } from "@/components/ui/Callout";

export const metadata: Metadata = { title: "Catálogo" };

function filterMock(filters: CatalogFilters) {
  let items = MOCK_COURSES;
  if (filters.q) {
    const q = filters.q.toLowerCase();
    items = items.filter(
      (c) => c.title.es?.toLowerCase().includes(q) || c.title.en?.toLowerCase().includes(q) || c.teacherName?.toLowerCase().includes(q),
    );
  }
  if (filters.areaSlug) items = items.filter((c) => c.areaSlug === filters.areaSlug);
  if (filters.modality) items = items.filter((c) => c.modality === filters.modality);
  if (filters.level) items = items.filter((c) => c.level === filters.level);
  if (filters.type) items = items.filter((c) => c.type === filters.type);
  if (filters.certificationOnly) items = items.filter((c) => c.certificationIncluded);
  if (filters.minPrice) items = items.filter((c) => Number(c.priceAmount) >= Number(filters.minPrice));
  if (filters.maxPrice) items = items.filter((c) => Number(c.priceAmount) <= Number(filters.maxPrice));
  if (filters.liveOnly) items = items.filter((c) => !!c.nextLiveSessionAt);
  if (filters.duration === "short") items = items.filter((c) => c.durationHours < 10);
  if (filters.duration === "medium") items = items.filter((c) => c.durationHours >= 10 && c.durationHours <= 20);
  if (filters.duration === "long") items = items.filter((c) => c.durationHours > 20);
  return items;
}

export default async function CatalogPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const t = await getTranslations("catalog");
  const tc = await getTranslations("common");

  const filters: CatalogFilters = {
    q: searchParams.q,
    areaSlug: searchParams.areaSlug as CatalogFilters["areaSlug"],
    modality: searchParams.modality as CatalogFilters["modality"],
    level: searchParams.level as CatalogFilters["level"],
    type: searchParams.type as CatalogFilters["type"],
    language: searchParams.language,
    certificationOnly: searchParams.certificationOnly === "true",
    minPrice: searchParams.minPrice ? Number(searchParams.minPrice) : undefined,
    maxPrice: searchParams.maxPrice ? Number(searchParams.maxPrice) : undefined,
    // Antes se aplicaban client-side, DESPUÉS de que la API ya había
    // paginado a 12 ítems sin saber de ellos — el conteo y el paginador
    // quedaban mal apenas se combinaban con cualquier otro filtro. Ahora
    // viajan como cualquier otro filtro, ver CatalogService.listCourses.
    duration: searchParams.duration as CatalogFilters["duration"],
    liveOnly: searchParams.liveOnly === "true" ? true : undefined,
    sort: searchParams.sort as CatalogFilters["sort"],
    page: searchParams.page ? Number(searchParams.page) : 1,
    pageSize: 12,
  };

  const [{ data: areas }, { data: courseResult, live }] = await Promise.all([
    withFallback(() => catalogApi.areas(), MOCK_AREAS),
    withFallback(
      () => catalogApi.courses(filters),
      { items: filterMock(filters), total: filterMock(filters).length, page: 1, pageSize: 12 },
    ),
  ]);

  const items = courseResult.items;

  return (
    <div className="container py-10">
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-semibold text-ink-900">{t("title")}</h1>
        <p className="mt-2 max-w-2xl text-ash-600">{t("subtitle")}</p>
      </div>

      {!live && (
        <Callout variant="info" className="mb-6">
          {tc("offlineNotice")}
        </Callout>
      )}

      <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
        <aside aria-label={t("filters.title")}>
          <Suspense fallback={null}>
            <FilterBar areas={areas} />
          </Suspense>
        </aside>

        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ash-500" aria-live="polite">
              {t("resultsCount", { count: items.length })}
            </p>
            <Suspense fallback={null}>
              <SortSelect />
            </Suspense>
          </div>
          {items.length === 0 ? (
            <p className="rounded-md border border-paper-border bg-paper-muted p-8 text-center text-ash-600">{t("noResults")}</p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

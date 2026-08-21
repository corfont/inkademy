import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { meApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { MOCK_SECTIONS } from "@/lib/mock-data";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth";
import { CourseCard } from "@/components/catalog/CourseCard";
import { Callout } from "@/components/ui/Callout";

export const metadata: Metadata = { title: "Recomendaciones" };

export default async function RecommendationsPage() {
  const t = await getTranslations("campus.recommendations");
  const accessToken = cookies().get(ACCESS_TOKEN_COOKIE)?.value ?? null;

  const { data: recommendations, live } = await withFallback(() => meApi.recommendations(accessToken), MOCK_SECTIONS.recommendedPaths);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">{t("title")}</h1>
      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      {recommendations.length === 0 ? (
        <p className="text-ash-500">{t("empty")}</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {recommendations.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { catalogApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { MOCK_PROGRAM } from "@/lib/mock-data";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { localize, formatPrice } from "@/lib/format";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const fallback = params.slug === MOCK_PROGRAM.slug ? MOCK_PROGRAM : undefined;
  return { title: fallback ? localize(fallback.title, "es") : "Programa" };
}

export default async function ProgramDetailPage({ params }: { params: { slug: string } }) {
  const locale = await getLocale();
  const t = await getTranslations("programDetail");
  const tc = await getTranslations("common");

  const fallback = params.slug === MOCK_PROGRAM.slug ? MOCK_PROGRAM : undefined;
  const { data: program, live } = await withFallback(() => catalogApi.program(params.slug), fallback as any);

  if (!program) notFound();

  return (
    <div className="container py-10">
      {!live && (
        <Callout variant="info" className="mb-6">
          {tc("offlineNotice")}
        </Callout>
      )}

      <div className="grid gap-10 lg:grid-cols-[1fr_20rem]">
        <div>
          <Badge variant="ink">{locale === "en" ? "Diploma program" : "Diplomado"}</Badge>
          <h1 className="mt-4 font-serif text-3xl font-semibold text-ink-900 sm:text-4xl">{localize(program.title, locale)}</h1>
          {program.description && <p className="mt-4 max-w-prose text-ash-600">{localize(program.description, locale)}</p>}

          <section className="mt-10">
            <h2 className="font-serif text-xl font-semibold text-ink-900">{t("coursesInProgram")}</h2>
            <ol className="mt-4 flex flex-col gap-3">
              {program.courses
                .sort((a, b) => a.order - b.order)
                .map((entry) => (
                  <li key={entry.courseId} className="flex items-center justify-between gap-4 rounded-lg border border-paper-border p-4">
                    <div className="flex items-center gap-4">
                      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-ink-50 font-serif text-sm font-semibold text-ink-700">
                        {entry.order}
                      </span>
                      <div>
                        <Link href={`/cursos/${entry.course.slug}`} className="font-medium text-ink-900 hover:underline">
                          {localize(entry.course.title, locale)}
                        </Link>
                        <p className="text-sm text-ash-500">
                          {entry.course.durationHours} {tc("hours")}
                        </p>
                      </div>
                    </div>
                    <Badge variant={entry.isRequired ? "ink" : "outline"}>{entry.isRequired ? t("required") : t("optional")}</Badge>
                  </li>
                ))}
            </ol>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-lg border border-paper-border bg-paper p-6 shadow-card">
            <p className="text-sm text-ash-500 line-through">{formatPrice(program.separatePriceTotal, program.priceCurrency, locale)}</p>
            <p className="mt-1 font-serif text-3xl font-semibold text-gold-600">
              {formatPrice(program.priceAmount, program.priceCurrency, locale)}
            </p>
            <p className="mt-2 text-sm font-medium text-success">
              {t("savings")} {formatPrice(program.savingsAmount, program.priceCurrency, locale)}
            </p>
            {program.certificationIncluded && (
              <p className="mt-3 flex items-center gap-2 text-sm text-ash-700">
                <BadgeCheck className="h-4 w-4 text-success" aria-hidden="true" />
                {t("finalCertification")}
              </p>
            )}
            <Link href={`/checkout?programId=${program.id}`} className="mt-5 block">
              <Button className="w-full" size="lg">
                {tc("enroll")}
              </Button>
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import type { CourseCardDTO } from "@inkademy/shared";
import { useTranslations, useLocale } from "next-intl";
import { BadgeCheck, Clock, Radio, User } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/components/providers/AuthProvider";
import { localize, formatPrice, formatDateTime, MODALITY_LABEL, TYPE_LABEL, LEVEL_LABEL } from "@/lib/format";

export function CourseCard({ course }: { course: CourseCardDTO }) {
  const locale = useLocale();
  const t = useTranslations("common");
  const { user } = useAuth();
  const isProgram = course.type === "PROGRAM" || course.type === "DIPLOMA";
  const href = isProgram ? `/programas/${course.slug}` : `/cursos/${course.slug}`;

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-lg border border-paper-border bg-paper shadow-card transition-shadow hover:shadow-raised">
      <Link href={href} className="block focus-visible:outline-2 focus-visible:outline-ink-500">
        <div
          className="flex h-40 items-center justify-center bg-gradient-to-br from-ink-700 to-ink-900 text-paper"
          role="img"
          aria-label={localize(course.title, locale)}
        >
          <span className="font-serif text-4xl font-semibold opacity-70">
            {localize(course.title, locale).charAt(0)}
          </span>
        </div>
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="ink">{MODALITY_LABEL[course.modality]?.[locale as "es" | "en"] ?? course.modality}</Badge>
          <Badge variant="outline">{TYPE_LABEL[course.type]?.[locale as "es" | "en"] ?? course.type}</Badge>
          <Badge variant="outline">{LEVEL_LABEL[course.level]?.[locale as "es" | "en"] ?? course.level}</Badge>
        </div>

        <Link href={href} className="focus-visible:outline-2 focus-visible:outline-ink-500">
          <h3 className="font-serif text-lg font-semibold leading-snug text-ink-900 group-hover:text-ink-700">
            {localize(course.subtitle ?? course.title, locale)}
          </h3>
        </Link>

        <dl className="flex flex-col gap-1.5 text-sm text-ash-600">
          {course.teacherName && (
            <div className="flex items-center gap-1.5">
              <User className="h-4 w-4 text-ash-400" aria-hidden="true" />
              <span>
                <span className="sr-only">{t("teacher")}: </span>
                {course.teacherName}
              </span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-ash-400" aria-hidden="true" />
            <span>
              {course.durationHours} {t("hours")}
            </span>
          </div>
          {course.nextLiveSessionAt && (
            <div className="flex items-center gap-1.5">
              <Radio className="h-4 w-4 text-ash-400" aria-hidden="true" />
              <span>{formatDateTime(course.nextLiveSessionAt, locale)}</span>
            </div>
          )}
          {course.certificationIncluded && (
            <div className="flex items-center gap-1.5 text-success">
              <BadgeCheck className="h-4 w-4" aria-hidden="true" />
              <span>{t("certified")}</span>
            </div>
          )}
        </dl>

        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          {course.b2bAvailable && isProgram ? (
            <span className="font-serif text-base font-semibold text-ink-900">{t("requestProposal")}</span>
          ) : user ? (
            <span className="font-serif text-lg font-semibold text-gold-600">
              {formatPrice(course.priceAmount, course.priceCurrency, locale)}
            </span>
          ) : (
            <Link href={`/login?next=${encodeURIComponent(href)}`} className="text-sm font-medium text-ink-600 underline-offset-2 hover:underline">
              {t("loginToSeePrice")}
            </Link>
          )}
          <Link href={href}>
            <Button size="sm" variant={isProgram ? "outline" : "primary"}>
              {isProgram ? t("seeProgram") : t("enroll")}
            </Button>
          </Link>
        </div>
      </div>
    </article>
  );
}

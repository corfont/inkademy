"use client";

import Link from "next/link";
import type { CourseCardDTO } from "@inkademy/shared";
import { useTranslations, useLocale } from "next-intl";
import { BadgeCheck, Clock, Radio, User, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/components/providers/AuthProvider";
import { useBrandSettings } from "@/components/providers/BrandSettingsProvider";
import { useCountdown } from "@/lib/useCountdown";
import { localize, formatPrice, formatDateTime, formatDuration, MODALITY_LABEL, TYPE_LABEL, LEVEL_LABEL } from "@/lib/format";
import { MODALITY_STYLE, TYPE_STYLE, LEVEL_STYLE, offeringStyle } from "@/lib/offering-style";

export function CourseCard({ course }: { course: CourseCardDTO }) {
  const locale = useLocale();
  const t = useTranslations("common");
  const { user } = useAuth();
  const { courseCardFields: fields } = useBrandSettings();
  const isProgram = course.type === "PROGRAM" || course.type === "DIPLOMA";
  const href = isProgram ? `/programas/${course.slug}` : `/cursos/${course.slug}`;
  // El contador vive del lado del cliente: si el tiempo se acaba mientras
  // el alumno tiene la página abierta, el % de descuento desaparece solo
  // (precio y estrella vuelven a la normalidad) sin que tenga que refrescar.
  const countdown = useCountdown(course.isOnSale ? course.discountExpiresAt : null);
  const isOnSale = course.isOnSale && !countdown.expired;

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-lg border border-paper-border bg-paper shadow-card transition-shadow hover:shadow-raised">
      <Link href={href} className="relative block focus-visible:outline-2 focus-visible:outline-ink-500">
        {course.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={course.coverImageUrl} alt="" className="h-40 w-full object-cover" />
        ) : (
          <div
            className="flex h-40 items-center justify-center bg-gradient-to-br from-ink-700 to-ink-900 text-paper"
            role="img"
            aria-label={localize(course.title, locale)}
          >
            <span className="font-serif text-4xl font-semibold opacity-70">
              {localize(course.title, locale).charAt(0)}
            </span>
          </div>
        )}
        {isOnSale && countdown.label && (
          <span className="absolute left-2 top-2 rounded-full bg-ink-950/85 px-2 py-0.5 text-[0.65rem] font-semibold text-white shadow-md">
            ⏳ {countdown.label}
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex flex-wrap gap-1.5">
          {[
            { style: offeringStyle(MODALITY_STYLE, course.modality), label: MODALITY_LABEL[course.modality]?.[locale as "es" | "en"] ?? course.modality },
            { style: offeringStyle(TYPE_STYLE, course.type), label: TYPE_LABEL[course.type]?.[locale as "es" | "en"] ?? course.type },
            { style: offeringStyle(LEVEL_STYLE, course.level), label: LEVEL_LABEL[course.level]?.[locale as "es" | "en"] ?? course.level },
          ].map(({ style, label }, i) => (
            <span key={i} className={`inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium ${style.classes}`}>
              <style.icon className="h-3 w-3" aria-hidden="true" />
              {label}
            </span>
          ))}
        </div>

        <Link href={href} className="focus-visible:outline-2 focus-visible:outline-ink-500">
          <h3 className="font-serif text-lg font-semibold leading-snug text-ink-900 group-hover:text-ink-700">
            {localize(course.subtitle ?? course.title, locale)}
          </h3>
        </Link>

        <dl className="flex flex-col gap-1.5 text-sm text-ash-600">
          {fields.showTeacher && course.teacherName && (
            <div className="flex items-center gap-1.5">
              <User className="h-4 w-4 text-ash-400" aria-hidden="true" />
              <span>
                <span className="sr-only">{t("teacher")}: </span>
                {course.teacherName}
              </span>
            </div>
          )}
          {fields.showDuration && (
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-ash-400" aria-hidden="true" />
              <span>{formatDuration(course.durationHours, course.durationUnit, locale as "es" | "en")}</span>
            </div>
          )}
          {fields.showNextLiveSession && course.nextLiveSessionAt && (
            <div className="flex items-center gap-1.5">
              <Radio className="h-4 w-4 text-ash-400" aria-hidden="true" />
              <span>{formatDateTime(course.nextLiveSessionAt, locale)}</span>
            </div>
          )}
          {fields.showCertificationBadge && course.certificationIncluded && (
            <div className="flex items-center gap-1.5 text-success">
              <BadgeCheck className="h-4 w-4" aria-hidden="true" />
              <span>{t("certified")}</span>
            </div>
          )}
        </dl>

        <div className="relative mt-auto flex items-center justify-between gap-3 pt-2">
          {isOnSale && (
            <span className="pointer-events-none absolute -top-9 right-0 z-10 flex h-20 w-20 rotate-[8deg] items-center justify-center drop-shadow-[0_4px_10px_rgba(220,0,0,0.55)]">
              <Star className="absolute inset-0 h-full w-full fill-red-600 text-red-700 animate-pulse" aria-hidden="true" />
              <span className="relative -rotate-[8deg] text-lg font-extrabold leading-none text-white">
                -{course.discountPercent}%
              </span>
            </span>
          )}
          {course.b2bAvailable && isProgram ? (
            <span className="font-serif text-base font-semibold text-ink-900">{t("requestProposal")}</span>
          ) : user ? (
            <div className="flex flex-col">
              {isOnSale && course.originalPriceAmount && (
                <span className="text-xs text-ash-500 line-through">
                  {formatPrice(course.originalPriceAmount, course.priceCurrency, locale)}
                </span>
              )}
              <span className={`font-serif text-lg font-semibold ${isOnSale ? "text-danger" : "text-gold-600"}`}>
                {formatPrice(isOnSale ? course.priceAmount : (course.originalPriceAmount ?? course.priceAmount), course.priceCurrency, locale)}
              </span>
              {isOnSale && countdown.label && (
                <span className="font-mono text-[0.7rem] font-semibold text-danger">
                  {locale === "en" ? "Offer ends in" : "Oferta finaliza en"} {countdown.label}
                </span>
              )}
            </div>
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

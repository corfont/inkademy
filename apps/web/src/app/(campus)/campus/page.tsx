import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { BookOpen, CalendarDays, Award, Sparkles, Star } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { meApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { MOCK_ENROLLMENTS } from "@/lib/mock-data";
import { ACCESS_TOKEN_COOKIE, SESSION_COOKIE, readSessionCookie } from "@/lib/auth";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { localize } from "@/lib/format";

export const metadata: Metadata = { title: "Mi campus" };

export default async function CampusDashboardPage() {
  const t = await getTranslations("campus.dashboard");
  const locale = await getLocale();
  const cookieStore = cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value ?? null;
  const sessionUser = readSessionCookie(cookieStore.get(SESSION_COOKIE)?.value);

  const { data: enrollments, live } = await withFallback(() => meApi.enrollments(undefined, accessToken), MOCK_ENROLLMENTS);

  const inProgress = enrollments.filter((e) => e.status === "ACTIVE");
  const continueItem = inProgress[0];
  // "El alumno deberá de ver notificaciones de lo que tiene pendiente por si
  // no sabe" — un curso ya terminado que solo espera la calificación en
  // estrellas se avisa acá también, no solo dentro del aula (ver
  // CourseRatingPrompt en Classroom.tsx).
  const pendingRating = enrollments.filter((e) => e.readyForRatingPrompt);

  const quickAccess = [
    { href: "/campus/cursos", label: "Mis cursos", icon: BookOpen, accent: "bg-indigo-50 text-indigo-600" },
    { href: "/campus/agenda", label: "Agenda", icon: CalendarDays, accent: "bg-success-bg text-success" },
    { href: "/campus/certificados", label: "Certificados", icon: Award, accent: "bg-gold-100 text-gold-700" },
    { href: "/campus/recomendaciones", label: "Recomendaciones", icon: Sparkles, accent: "bg-indigo-50 text-indigo-600" },
  ];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">
        {t("greeting", { name: sessionUser?.firstName ?? "" })}
      </h1>

      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      {pendingRating.length > 0 && (
        <Card className="border-warning bg-warning-bg">
          <CardContent className="flex items-center gap-4 p-5">
            <Star className="h-8 w-8 flex-none fill-warning text-warning" aria-hidden="true" />
            <div className="flex-1">
              <p className="font-medium text-ink-900">
                {pendingRating.length === 1 ? "Terminaste un curso — califícalo para recibir tu certificado" : `Terminaste ${pendingRating.length} cursos — califícalos para recibir tus certificados`}
              </p>
            </div>
            <Link href={`/campus/cursos/${pendingRating[0].id}`}>
              <Button size="sm">Calificar</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      <section>
        <h2 className="mb-3 font-serif text-lg font-semibold text-ink-900">{t("continueLearning")}</h2>
        {continueItem ? (
          <Card>
            <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1">
                <p className="font-medium text-ink-900">{localize(continueItem.title, locale)}</p>
                {continueItem.nextActionLabel && <p className="mt-1 text-sm text-ash-600">{continueItem.nextActionLabel}</p>}
                <ProgressBar value={continueItem.progressPct} label="Progreso" className="mt-3 max-w-sm" />
              </div>
              <Link href={`/campus/cursos/${continueItem.id}`}>
                <Button>Continuar</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
              <p className="text-ash-600">{t("noContinue")}</p>
              <Link href="/catalogo">
                <Button variant="outline">{t("browseCatalog")}</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-serif text-lg font-semibold text-ink-900">{t("quickAccess")}</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {quickAccess.map((q) => (
            <Link
              key={q.href}
              href={q.href}
              className="flex flex-col items-center gap-2.5 rounded-lg border border-paper-border bg-paper p-5 text-center shadow-card transition-shadow hover:shadow-raised"
            >
              <span className={`flex h-11 w-11 items-center justify-center rounded-full ${q.accent}`}>
                <q.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-sm font-medium text-ink-900">{q.label}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

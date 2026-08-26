import type { Metadata } from "next";
import Link from "next/link";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { Card, CardContent } from "@/components/ui/Card";
import { Callout } from "@/components/ui/Callout";
import { Button } from "@/components/ui/Button";
import { JoinClassButton } from "@/components/campus/JoinClassButton";
import { localize, formatDateTime } from "@/lib/format";
import { getLocale } from "next-intl/server";
import { LibraryBig, ClipboardCheck, Radio } from "lucide-react";

export const metadata: Metadata = { title: "Panel de docente" };

interface TeacherDashboard {
  courses: { id: string; slug: string; title: Record<string, string>; status: string; areaName?: Record<string, string> }[];
  upcomingLiveSessions: { id: string; courseId: string; courseTitle: Record<string, string>; startsAt: string; endsAt: string; joinUrl: string | null }[];
  pendingReviewCount: number;
}

const EMPTY: TeacherDashboard = { courses: [], upcomingLiveSessions: [], pendingReviewCount: 0 };

export default async function TeacherDashboardPage() {
  const locale = await getLocale();
  const accessToken = getServerAccessToken();
  const { data, live } = await withFallback(() => adminApi.teacherDashboard(accessToken), EMPTY);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">Panel de docente</h1>
      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="transition-shadow hover:shadow-raised">
          <CardContent className="p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
              <LibraryBig className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-3 font-serif text-2xl font-semibold text-ink-900">{data.courses.length}</p>
            <p className="text-sm text-ash-500">Cursos asignados</p>
          </CardContent>
        </Card>
        <Card className="transition-shadow hover:shadow-raised">
          <CardContent className="p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success-bg text-success">
              <Radio className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-3 font-serif text-2xl font-semibold text-ink-900">{data.upcomingLiveSessions.length}</p>
            <p className="text-sm text-ash-500">Próximas clases en vivo</p>
          </CardContent>
        </Card>
        <Card className="transition-shadow hover:shadow-raised">
          <CardContent className="p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gold-100 text-gold-700">
              <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-3 font-serif text-2xl font-semibold text-ink-900">{data.pendingReviewCount}</p>
            <p className="text-sm text-ash-500">Evaluaciones por calificar</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Próximas clases a dictar</h2>
          {data.upcomingLiveSessions.length === 0 ? (
            <p className="text-sm text-ash-500">No tienes clases en vivo programadas.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.upcomingLiveSessions.map((s: TeacherDashboard["upcomingLiveSessions"][number]) => (
                <li key={s.id} className="flex items-center justify-between gap-3 rounded-md bg-paper-muted p-3 text-sm">
                  <div>
                    <p className="font-medium text-ink-900">{localize(s.courseTitle, locale)}</p>
                    <p className="text-xs text-ash-500">{formatDateTime(s.startsAt, locale)}</p>
                  </div>
                  <JoinClassButton liveSessionId={s.id} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Mis cursos</h2>
          {data.courses.length === 0 ? (
            <p className="text-sm text-ash-500">Todavía no tienes cursos asignados.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.courses.map((c: TeacherDashboard["courses"][number]) => (
                <li key={c.id} className="flex items-center justify-between gap-3 rounded-md bg-paper-muted p-3 text-sm">
                  <p className="font-medium text-ink-900">{localize(c.title, locale)}</p>
                  <Link href={`/docente/cursos/${c.id}`}>
                    <Button size="sm" variant="outline">
                      Gestionar
                    </Button>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

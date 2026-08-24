import type { Metadata } from "next";
import Link from "next/link";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { localize } from "@/lib/format";
import { getLocale } from "next-intl/server";

export const metadata: Metadata = { title: "Mis cursos (docente)" };

export default async function TeacherCoursesPage() {
  const locale = await getLocale();
  const accessToken = getServerAccessToken();
  const { data: courses, live } = await withFallback(() => adminApi.courses(accessToken), [] as any[]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">Mis cursos</h1>
      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      {courses.length === 0 ? (
        <p className="text-sm text-ash-500">Todavía no tienes cursos asignados. Escribe a soporte si crees que esto es un error.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {courses.map((c: any) => (
            <Link key={c.id} href={`/docente/cursos/${c.id}`}>
              <Card className="transition-shadow hover:shadow-raised">
                <CardContent className="flex items-center justify-between gap-4 p-5">
                  <div>
                    <p className="font-medium text-ink-900">{localize(c.title, locale)}</p>
                    <p className="text-xs text-ash-500">/{c.slug}</p>
                  </div>
                  <Badge variant={c.status === "PUBLISHED" ? "success" : "neutral"}>{c.status}</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { localize, formatDate } from "@/lib/format";

interface ProgramDetail {
  id: string;
  title: Record<string, string>;
  description: Record<string, string> | null;
  status: string;
  progressPct: number;
  accessExpiresAt: string | null;
  certificateAvailable: boolean;
  courses: { courseId: string; title: Record<string, string>; isRequired: boolean; enrollmentId: string | null; status: string | null; progressPct: number }[];
}

/** Aula de un Programa/Diplomado: lista sus cursos con el avance de cada uno y lleva a la matrícula de cada curso. */
export function ProgramView({ detail }: { detail: ProgramDetail }) {
  const locale = useLocale();
  const done = detail.courses.filter((c) => c.status === "COMPLETED").length;
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-serif text-3xl font-semibold text-ink-900">{localize(detail.title, locale)}</h1>
        {detail.description && <p className="max-w-prose text-ink-600">{localize(detail.description, locale)}</p>}
        <div className="flex flex-wrap items-center gap-3 text-sm text-ink-600">
          <Badge variant={detail.status === "COMPLETED" ? "success" : "ink"}>{detail.status === "COMPLETED" ? "Programa completado" : "En curso"}</Badge>
          <span>{done} de {detail.courses.length} cursos completados</span>
          {detail.accessExpiresAt && <span>Acceso hasta {formatDate(detail.accessExpiresAt, locale)}</span>}
        </div>
        <ProgressBar value={detail.progressPct} />
        {detail.certificateAvailable && (
          <Link href="/campus/certificados" className="text-sm font-medium text-teal-700 underline">
            Ver el certificado del programa
          </Link>
        )}
      </header>
      <ul className="grid gap-3">
        {detail.courses.map((c, i) => (
          <li key={c.courseId}>
            <Card>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                  <span className="text-xs uppercase tracking-wide text-ink-500">Curso {i + 1}{c.isRequired ? "" : " · opcional"}</span>
                  <span className="font-medium text-ink-900">{localize(c.title, locale)}</span>
                  <div className="w-64 max-w-full"><ProgressBar value={c.progressPct} /></div>
                </div>
                {c.enrollmentId ? (
                  <Link href={`/campus/cursos/${c.enrollmentId}`} className="text-sm font-medium text-teal-700 underline">
                    {c.status === "COMPLETED" ? "Revisar" : c.progressPct > 0 ? "Continuar" : "Empezar"}
                  </Link>
                ) : (
                  <span className="text-sm text-ink-500">Aún sin matrícula</span>
                )}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

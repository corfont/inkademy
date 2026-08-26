import type { Metadata } from "next";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { CourseRatingsManager } from "@/components/admin/CourseRatingsManager";
import { Callout } from "@/components/ui/Callout";

export const metadata: Metadata = { title: "Calificaciones de cursos (admin)" };

export default async function AdminCourseRatingsPage() {
  const accessToken = getServerAccessToken();
  const { data: results, live } = await withFallback(() => adminApi.courseRatings({}, accessToken), {
    totalResponses: 0,
    avgStars: null,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    courses: [],
    responses: [],
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Calificaciones de cursos</h1>
        <p className="mt-1 text-sm text-ash-500">
          La encuesta de satisfacción (estrellas + comentario) que el alumno responde al terminar un curso — distribución de notas y qué están
          diciendo.
        </p>
      </div>
      {!live && <Callout variant="info">No pudimos conectar con la API — no se muestran datos reales por ahora.</Callout>}
      <CourseRatingsManager initial={results} />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Star } from "lucide-react";
import { adminApi } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/Card";
import { Select } from "@/components/ui/Input";
import { localize, formatDate } from "@/lib/format";

function StarRow({ stars, size = "sm" }: { stars: number; size?: "sm" | "lg" }) {
  const cls = size === "lg" ? "h-6 w-6" : "h-3.5 w-3.5";
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${stars} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${cls} ${n <= stars ? "fill-gold-400 text-gold-400" : "fill-none text-ash-300"}`} aria-hidden="true" />
      ))}
    </span>
  );
}

/**
 * "El administrador podría ver los resultados de la encuesta de
 * satisfacción [con estrellas] como... y un listado de comentarios" —
 * antes CourseRating (las estrellas que deja el alumno al terminar un
 * curso) solo alimentaba el promedio visible en la ficha pública del
 * curso; no existía ningún panel agregado para el admin, a diferencia de
 * la encuesta NPS que sí tenía el suyo (ver /admin/encuestas-nps, mismo
 * criterio de "distribución + comentarios" aplicado acá).
 */
export function CourseRatingsManager({ initial }: { initial: any }) {
  const [courseId, setCourseId] = useState("");
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    adminApi
      .courseRatings({ courseId: courseId || undefined })
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const maxCount = Math.max(1, ...Object.values(data.distribution as Record<string, number>));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Select value={courseId} onChange={(e) => setCourseId(e.target.value)} className="w-72">
            <option value="">Todos los cursos</option>
            {initial.courses.map((c: any) => (
              <option key={c.id} value={c.id}>
                {localize(c.title, "es")}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {data.totalResponses === 0 ? (
        <p className="text-sm text-ash-500">Todavía no hay calificaciones {courseId ? "para este curso" : "registradas"}.</p>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
              <div className="flex flex-col items-center gap-1 sm:border-r sm:border-paper-border sm:pr-6">
                <p className="font-serif text-4xl font-semibold text-ink-900">{data.avgStars?.toFixed(1)}</p>
                <StarRow stars={Math.round(data.avgStars ?? 0)} size="lg" />
                <p className="text-xs text-ash-500">{data.totalResponses} respuesta{data.totalResponses === 1 ? "" : "s"}</p>
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                {[5, 4, 3, 2, 1].map((n) => {
                  const count = data.distribution[n] ?? 0;
                  const pct = data.totalResponses > 0 ? Math.round((count / data.totalResponses) * 100) : 0;
                  return (
                    <div key={n} className="flex items-center gap-2 text-sm">
                      <span className="flex w-10 items-center gap-0.5 text-ash-600">
                        {n} <Star className="h-3.5 w-3.5 fill-gold-400 text-gold-400" aria-hidden="true" />
                      </span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-paper-muted">
                        <div className="h-full rounded-full bg-gold-400" style={{ width: `${(count / maxCount) * 100}%` }} />
                      </div>
                      <span className="w-16 shrink-0 text-right text-xs text-ash-500">
                        {count} · {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <h2 className="mb-4 font-serif text-lg font-semibold text-ink-900">Comentarios</h2>
              {loading ? (
                <p className="text-sm text-ash-500">Cargando…</p>
              ) : data.responses.filter((r: any) => r.comment).length === 0 ? (
                <p className="text-sm text-ash-500">Ninguna calificación con comentario todavía.</p>
              ) : (
                <div className="flex flex-col divide-y divide-paper-border">
                  {data.responses
                    .filter((r: any) => r.comment)
                    .map((r: any) => (
                      <div key={r.id} className="flex items-start gap-3 py-3">
                        <MessageCircle className="mt-0.5 h-4 w-4 flex-none text-ash-400" aria-hidden="true" />
                        <div>
                          <p className="text-sm text-ink-800">{r.comment}</p>
                          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ash-500">
                            <StarRow stars={r.stars} /> · {r.studentName} · {localize(r.courseTitle, "es")} · {formatDate(r.createdAt, "es")}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

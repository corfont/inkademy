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
  // "Debe también poderse ordenar o filtrar por estrellas para leer los
  // comentarios" — starFilter=0 es "todas"; sortOrder ordena la lista de
  // comentarios (los datos ya vienen completos del API, se filtra/ordena
  // acá mismo sin otro roundtrip).
  const [starFilter, setStarFilter] = useState(0);
  const [sortOrder, setSortOrder] = useState<"recent" | "highest" | "lowest">("recent");

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
                  const active = starFilter === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setStarFilter(active ? 0 : n)}
                      title={`Filtrar comentarios de ${n} estrella${n === 1 ? "" : "s"}`}
                      className={`flex items-center gap-2 rounded-md px-1.5 py-0.5 text-sm transition-colors ${active ? "bg-gold-100" : "hover:bg-paper-muted"}`}
                    >
                      <span className="flex w-10 items-center gap-0.5 text-ash-600">
                        {n} <Star className="h-3.5 w-3.5 fill-gold-400 text-gold-400" aria-hidden="true" />
                      </span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-paper-muted">
                        <div className="h-full rounded-full bg-gold-400" style={{ width: `${(count / maxCount) * 100}%` }} />
                      </div>
                      <span className="w-16 shrink-0 text-right text-xs text-ash-500">
                        {count} · {pct}%
                      </span>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-serif text-lg font-semibold text-ink-900">Comentarios</h2>
                <div className="flex items-center gap-2">
                  {starFilter > 0 && (
                    <button
                      type="button"
                      onClick={() => setStarFilter(0)}
                      className="inline-flex items-center gap-1 rounded-full bg-gold-100 px-2.5 py-1 text-xs font-medium text-gold-700"
                    >
                      {starFilter} <Star className="h-3 w-3 fill-gold-700 text-gold-700" aria-hidden="true" /> · Quitar filtro
                    </button>
                  )}
                  <Select value={sortOrder} onChange={(e) => setSortOrder(e.target.value as typeof sortOrder)} className="h-8 w-44 text-xs">
                    <option value="recent">Más recientes</option>
                    <option value="highest">Mejor calificados</option>
                    <option value="lowest">Peor calificados</option>
                  </Select>
                </div>
              </div>
              {loading ? (
                <p className="text-sm text-ash-500">Cargando…</p>
              ) : (
                (() => {
                  const comments = data.responses
                    .filter((r: any) => r.comment && (starFilter === 0 || r.stars === starFilter))
                    .sort((a: any, b: any) =>
                      sortOrder === "highest" ? b.stars - a.stars : sortOrder === "lowest" ? a.stars - b.stars : 0,
                    );
                  return comments.length === 0 ? (
                    <p className="text-sm text-ash-500">
                      {starFilter > 0 ? `Ninguna calificación de ${starFilter} estrellas con comentario.` : "Ninguna calificación con comentario todavía."}
                    </p>
                  ) : (
                    <div className="flex flex-col divide-y divide-paper-border">
                      {comments.map((r: any) => (
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
                  );
                })()
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

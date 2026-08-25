"use client";

import { useEffect, useState } from "react";
import { adminApi, ApiError } from "@/lib/api-client";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

function pickEs(text: unknown): string {
  const t = text as Record<string, string> | null | undefined;
  return t?.es ?? t?.en ?? "";
}

function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" });
}

/**
 * "El admin debe poder ver a qué hora se conectó y desconectó el docente
 * en las clases en vivo, y el balance de horas dictadas por clase y por
 * curso — porque a los docentes externos se les paga por horas
 * EFECTIVAMENTE usadas." Detalle sesión por sesión + resumen por docente y
 * por curso. La hora de conexión/desconexión viene de Attendance
 * (sincronizada desde Microsoft Graph tras la clase, o manual si Graph no
 * llegó a sincronizar todavía).
 */
export function TeacherSessionHoursReport({ teachers, courses }: { teachers: any[]; courses: any[] }) {
  const [teacherId, setTeacherId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<{ sessions: any[]; byTeacher: any[]; byCourse: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApi.teacherSessionHours({
        teacherId: teacherId || undefined,
        courseId: courseId || undefined,
        from: from || undefined,
        to: to || undefined,
      });
      setData(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos cargar el reporte.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {error && <Callout variant="danger">{error}</Callout>}

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-5">
          <div>
            <Label htmlFor="tsh-teacher">Docente</Label>
            <Select id="tsh-teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">Todos</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.firstName} {t.lastName}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="tsh-course">Curso</Label>
            <Select id="tsh-course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">Todos</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {pickEs(c.title)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="tsh-from">Desde</Label>
            <Input id="tsh-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="tsh-to">Hasta</Label>
            <Input id="tsh-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button size="sm" disabled={loading} onClick={refresh}>
            {loading ? "Cargando…" : "Filtrar"}
          </Button>
        </CardContent>
      </Card>

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardContent className="p-5">
                <h3 className="mb-3 font-serif text-lg font-semibold text-ink-900">Balance por docente</h3>
                {data.byTeacher.length === 0 ? (
                  <p className="text-sm text-ash-500">Sin sesiones en el rango filtrado.</p>
                ) : (
                  <ul className="flex flex-col gap-2 text-sm">
                    {data.byTeacher.map((t) => (
                      <li key={t.teacherId} className="flex items-center justify-between gap-2 border-b border-paper-border pb-2 last:border-0">
                        <span>
                          {t.teacherName} <span className="text-xs text-ash-500">({t.sessions} sesión{t.sessions === 1 ? "" : "es"})</span>
                        </span>
                        <span className="text-right text-xs">
                          <span className="font-medium text-ink-900">{fmtMinutes(t.payableMinutes)}</span> pagable / {fmtMinutes(t.scheduledMinutes)} programado
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <h3 className="mb-3 font-serif text-lg font-semibold text-ink-900">Balance por curso</h3>
                {data.byCourse.length === 0 ? (
                  <p className="text-sm text-ash-500">Sin sesiones en el rango filtrado.</p>
                ) : (
                  <ul className="flex flex-col gap-2 text-sm">
                    {data.byCourse.map((c) => (
                      <li key={c.courseId} className="flex items-center justify-between gap-2 border-b border-paper-border pb-2 last:border-0">
                        <span>
                          {pickEs(c.courseTitle)} <span className="text-xs text-ash-500">({c.sessions} sesión{c.sessions === 1 ? "" : "es"})</span>
                        </span>
                        <span className="text-right text-xs">
                          <span className="font-medium text-ink-900">{fmtMinutes(c.payableMinutes)}</span> pagable / {fmtMinutes(c.scheduledMinutes)} programado
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-5">
              <h3 className="mb-3 font-serif text-lg font-semibold text-ink-900">Detalle por sesión</h3>
              {data.sessions.length === 0 ? (
                <p className="text-sm text-ash-500">Sin sesiones en el rango filtrado.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-paper-border text-ash-500">
                      <tr>
                        <th className="p-2 font-medium">Curso</th>
                        <th className="p-2 font-medium">Docente</th>
                        <th className="p-2 font-medium">Programado</th>
                        <th className="p-2 font-medium">Se conectó</th>
                        <th className="p-2 font-medium">Se desconectó</th>
                        <th className="p-2 font-medium">Tardanza</th>
                        <th className="p-2 font-medium">Salida temprana</th>
                        <th className="p-2 font-medium">Pagable</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-paper-border">
                      {data.sessions.map((s) => (
                        <tr key={s.sessionId}>
                          <td className="p-2">{pickEs(s.courseTitle)}</td>
                          <td className="p-2">{s.teacherName}</td>
                          <td className="p-2">
                            {fmtDateTime(s.startsAt)} — {new Date(s.endsAt).toLocaleTimeString("es-PE", { timeStyle: "short" })}
                          </td>
                          <td className="p-2">{fmtDateTime(s.joinedAt)}</td>
                          <td className="p-2">{fmtDateTime(s.leftAt)}</td>
                          <td className="p-2">{s.latenessMinutes > 0 ? <Badge variant="warning">{fmtMinutes(s.latenessMinutes)}</Badge> : "—"}</td>
                          <td className="p-2">{s.earlinessMinutes > 0 ? <Badge variant="warning">{fmtMinutes(s.earlinessMinutes)}</Badge> : "—"}</td>
                          <td className="p-2 font-medium text-ink-900">
                            {fmtMinutes(s.payableMinutes)}
                            {!s.hasAttendanceData && <span className="ml-1 text-ash-400" title="Sin dato real de asistencia — se estima con lo programado">*</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-ash-400">* Sin dato de asistencia todavía (sesión futura, o Microsoft Graph no sincronizó) — se estima con la duración programada completa.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

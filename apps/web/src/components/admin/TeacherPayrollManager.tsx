"use client";

import { useEffect, useState } from "react";
import { adminApi, ApiError } from "@/lib/api-client";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

const FREQ_LABEL: Record<string, string> = { DAILY: "Diario", WEEKLY: "Semanal", MONTHLY: "Mensual", END_OF_COURSE: "Al finalizar el curso" };

/**
 * "En Liquidación de docentes yo debería ver el listado de lo que tengo
 * que abonarle a los docentes mes a mes... la tolerancia debería ir en
 * otra pantalla o submenú" — se separó en dos: esta pantalla (overview)
 * muestra las liquidaciones de TODOS los docentes de un vistazo, sin
 * tener que elegir uno primero; la configuración de tarifa/tolerancia/
 * adelantos vive en /admin/liquidaciones/tarifas (TeacherPayrollConfigManager).
 */
export function TeacherLiquidationsOverview({ teachers }: { teachers: any[] }) {
  const [teacherFilter, setTeacherFilter] = useState("");
  const [liquidations, setLiquidations] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [genTeacherId, setGenTeacherId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");

  async function refresh() {
    try {
      const l = await adminApi.teacherLiquidations(teacherFilter || undefined);
      setLiquidations(l);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos cargar las liquidaciones.");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherFilter]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ocurrió un error.");
    } finally {
      setBusy(false);
    }
  }

  function teacherName(t: { firstName?: string; lastName?: string; email?: string } | null | undefined) {
    if (!t) return "—";
    const name = [t.firstName, t.lastName].filter(Boolean).join(" ");
    return name || t.email || "—";
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <Callout variant="danger">{error}</Callout>}

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Generar liquidación</h2>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label>Docente</Label>
              <Select className="w-64" value={genTeacherId} onChange={(e) => setGenTeacherId(e.target.value)}>
                <option value="">Elegir docente…</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.firstName} {t.lastName} ({t.email})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Desde</Label>
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div>
              <Label>Hasta</Label>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
            <Button
              disabled={busy || !genTeacherId || !periodStart || !periodEnd}
              onClick={() =>
                run(() => adminApi.generateTeacherLiquidation({ teacherId: genTeacherId, periodStart, periodEnd })).then(() => {
                  setPeriodStart("");
                  setPeriodEnd("");
                })
              }
            >
              Generar
            </Button>
          </div>
          <p className="text-xs text-ash-500">
            Cada docente puede tener una modalidad de pago distinta (tarifa por hora, tolerancia, frecuencia) — se configura en{" "}
            <a href="/admin/liquidaciones/tarifas" className="font-medium text-ink-700 underline">
              Tarifas y adelantos
            </a>
            .
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-serif text-lg font-semibold text-ink-900">Lo que se le debe abonar a cada docente</h2>
            <Select className="w-64" value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)}>
              <option value="">Todos los docentes</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.firstName} {t.lastName}
                </option>
              ))}
            </Select>
          </div>
          {liquidations.length === 0 ? (
            <p className="text-sm text-ash-500">Todavía no hay liquidaciones generadas.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-paper-border">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-paper-border text-ash-500">
                  <tr>
                    <th className="p-2 font-medium">Docente</th>
                    <th className="p-2 font-medium">Periodo</th>
                    <th className="p-2 font-medium">Horas dictado</th>
                    <th className="p-2 font-medium">Horas otras</th>
                    <th className="p-2 font-medium">Bruto</th>
                    <th className="p-2 font-medium">Descuento</th>
                    <th className="p-2 font-medium">Adelantos</th>
                    <th className="p-2 font-medium">Neto a pagar</th>
                    <th className="p-2 font-medium">Estado</th>
                    <th className="p-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-paper-border">
                  {liquidations.map((l) => (
                    <tr key={l.id}>
                      <td className="p-2 font-medium">{teacherName(l.teacher)}</td>
                      <td className="p-2">
                        {new Date(l.periodStart).toLocaleDateString("es-PE")} — {new Date(l.periodEnd).toLocaleDateString("es-PE")}
                      </td>
                      <td className="p-2">{l.hoursTeaching}h</td>
                      <td className="p-2">{l.hoursOtherActivities}h</td>
                      <td className="p-2">
                        {currencySymbol(l.currency)}
                        {Number(l.grossAmount).toFixed(2)}
                      </td>
                      <td className="p-2">
                        {currencySymbol(l.currency)}
                        {Number(l.deductions).toFixed(2)} {l.deductionsWaived && <Badge variant="warning">Perdonado</Badge>}
                      </td>
                      <td className="p-2">
                        {currencySymbol(l.currency)}
                        {Number(l.advancesDeducted).toFixed(2)}
                      </td>
                      <td className="p-2 font-semibold text-ink-900">
                        {currencySymbol(l.currency)}
                        {Number(l.netAmount).toFixed(2)}
                      </td>
                      <td className="p-2">
                        <Badge variant={l.status === "PAID" ? "success" : l.status === "APPROVED" ? "warning" : "outline"}>{l.status}</Badge>
                      </td>
                      <td className="p-2">
                        <div className="flex flex-wrap gap-1">
                          {Number(l.deductions) > 0 && !l.deductionsWaived && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy}
                              onClick={() => {
                                const reason = prompt("Motivo para perdonar la penalidad:");
                                if (reason) run(() => adminApi.waiveTeacherLiquidation(l.id, reason));
                              }}
                            >
                              Perdonar
                            </Button>
                          )}
                          {l.status === "DRAFT" && (
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => adminApi.updateTeacherLiquidationStatus(l.id, "APPROVED"))}>
                              Aprobar
                            </Button>
                          )}
                          {l.status === "APPROVED" && (
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => adminApi.updateTeacherLiquidationStatus(l.id, "PAID"))}>
                              Marcar pagada
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * "A los docentes si son externos se les paga por horas efectivamente
 * utilizadas... el administrador debe establecer el costo por hora para
 * dictado y para otras actividades... se descuenta si excede la
 * tolerancia." Configuración por docente: tarifa (global y por curso),
 * tolerancia, frecuencia de pago, horas de otras actividades y adelantos.
 * Vive separada del overview de liquidaciones (ver TeacherLiquidationsOverview)
 * porque son tareas distintas: acá se configura CÓMO se le paga a cada
 * docente, allá se ve QUÉ se le debe pagar.
 */
export function TeacherPayrollConfigManager({ teachers, courses }: { teachers: any[]; courses: any[] }) {
  const [teacherId, setTeacherId] = useState("");
  const [rates, setRates] = useState<any[]>([]);
  const [advances, setAdvances] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refreshAll(id: string) {
    if (!id) return;
    try {
      const [r, a, l] = await Promise.all([adminApi.teacherRates(id), adminApi.teacherAdvances(id), adminApi.teacherActivityLogs(id)]);
      setRates(r);
      setAdvances(a);
      setActivityLogs(l);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos cargar los datos del docente.");
    }
  }

  useEffect(() => {
    if (teacherId) refreshAll(teacherId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId]);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await action();
      await refreshAll(teacherId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ocurrió un error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <Callout variant="danger">{error}</Callout>}

      <Card>
        <CardContent className="p-6">
          <Label htmlFor="teacher-picker">Docente</Label>
          <Select id="teacher-picker" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="max-w-sm">
            <option value="">Elegir docente…</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.firstName} {t.lastName} ({t.email})
              </option>
            ))}
          </Select>
        </CardContent>
      </Card>

      {teacherId && (
        <>
          <RateEditor teacherId={teacherId} rates={rates} courses={courses} busy={busy} run={run} />
          <ActivityLogEditor teacherId={teacherId} logs={activityLogs} courses={courses} busy={busy} run={run} />
          <AdvanceEditor teacherId={teacherId} advances={advances} busy={busy} run={run} />
        </>
      )}
    </div>
  );
}

function RateEditor({ teacherId, rates, courses, busy, run }: { teacherId: string; rates: any[]; courses: any[]; busy: boolean; run: any }) {
  const [courseId, setCourseId] = useState("");
  const [hourlyRateTeaching, setHourlyRateTeaching] = useState("0");
  const [hourlyRateOtherActivities, setHourlyRateOtherActivities] = useState("0");
  const [currency, setCurrency] = useState("PEN");
  const [toleranceMinutes, setToleranceMinutes] = useState("10");
  const [paymentFrequency, setPaymentFrequency] = useState("MONTHLY");

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <h2 className="font-serif text-lg font-semibold text-ink-900">Tarifas</h2>
        <p className="text-xs text-ash-500">
          Cada docente puede tener tarifas distintas — una global y, si hace falta, una específica por curso (que tiene prioridad sobre la
          global). La tolerancia son minutos de gracia al inicio/fin de cada clase antes de descontar por tardanza/salida temprana.
        </p>
        {rates.length > 0 && (
          <ul className="flex flex-col gap-1">
            {rates.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-paper-muted p-2 text-xs">
                <span>
                  {r.course ? r.course.title?.es ?? r.course.slug : "Tarifa global"} — {currencySymbol(r.currency)}{Number(r.hourlyRateTeaching).toFixed(2)}/h dictado,{" "}
                  {currencySymbol(r.currency)}{Number(r.hourlyRateOtherActivities).toFixed(2)}/h otras · tolerancia {r.toleranceMinutes}min ·{" "}
                  {FREQ_LABEL[r.paymentFrequency]}
                </span>
                <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-bg" disabled={busy} onClick={() => run(() => adminApi.deleteTeacherRate(r.id))}>
                  Eliminar
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Curso (opcional — vacío = tarifa global)</Label>
            <Select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">Tarifa global</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title?.es ?? c.slug}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Tarifa por hora dictada</Label>
            <Input type="number" min="0" step="0.01" value={hourlyRateTeaching} onChange={(e) => setHourlyRateTeaching(e.target.value)} />
          </div>
          <div>
            <Label>Tarifa por hora de otras actividades</Label>
            <Input type="number" min="0" step="0.01" value={hourlyRateOtherActivities} onChange={(e) => setHourlyRateOtherActivities(e.target.value)} />
          </div>
          <div>
            <Label>Moneda</Label>
            <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="PEN">Soles</option>
              <option value="USD">Dólares</option>
            </Select>
          </div>
          <div>
            <Label>Tolerancia (min)</Label>
            <Input type="number" min="0" max="120" value={toleranceMinutes} onChange={(e) => setToleranceMinutes(e.target.value)} />
          </div>
          <div>
            <Label>Frecuencia de pago</Label>
            <Select value={paymentFrequency} onChange={(e) => setPaymentFrequency(e.target.value)}>
              {Object.entries(FREQ_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              run(() =>
                adminApi.upsertTeacherRate({
                  teacherId,
                  courseId: courseId || null,
                  hourlyRateTeaching: Number(hourlyRateTeaching),
                  hourlyRateOtherActivities: Number(hourlyRateOtherActivities),
                  currency,
                  toleranceMinutes: Number(toleranceMinutes),
                  paymentFrequency,
                }),
              )
            }
          >
            Guardar tarifa
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ActivityLogEditor({ teacherId, logs, courses, busy, run }: { teacherId: string; logs: any[]; courses: any[]; busy: boolean; run: any }) {
  const [courseId, setCourseId] = useState("");
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <h2 className="font-serif text-lg font-semibold text-ink-900">Horas de otras actividades</h2>
        <p className="text-xs text-ash-500">Por ejemplo, tiempo calificando exámenes manuales — no hay forma de medir esto automáticamente, se ingresa a mano.</p>
        {logs.length > 0 && (
          <ul className="flex flex-col gap-1">
            {logs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-paper-muted p-2 text-xs">
                <span>
                  {new Date(l.loggedAt).toLocaleDateString("es-PE")} · {l.hours}h · {l.course ? l.course.title?.es ?? l.course.slug : "General"}
                  {l.note ? ` — ${l.note}` : ""}
                </span>
                <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-bg" disabled={busy} onClick={() => run(() => adminApi.deleteTeacherActivityLog(l.id))}>
                  Eliminar
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <Select className="w-48" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">Sin curso específico</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title?.es ?? c.slug}
              </option>
            ))}
          </Select>
          <Input type="number" min="0" step="0.25" placeholder="Horas" className="w-24" value={hours} onChange={(e) => setHours(e.target.value)} />
          <Input placeholder="Nota (opcional)" className="max-w-xs" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button
            size="sm"
            disabled={busy || !hours}
            onClick={() => {
              run(() => adminApi.createTeacherActivityLog({ teacherId, courseId: courseId || undefined, hours: Number(hours), note: note || undefined }));
              setHours("");
              setNote("");
            }}
          >
            Registrar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AdvanceEditor({ teacherId, advances, busy, run }: { teacherId: string; advances: any[]; busy: boolean; run: any }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <h2 className="font-serif text-lg font-semibold text-ink-900">Adelantos</h2>
        {advances.length > 0 && (
          <ul className="flex flex-col gap-1">
            {advances.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-paper-muted p-2 text-xs">
                <span>
                  {new Date(a.grantedAt).toLocaleDateString("es-PE")} · {currencySymbol(a.currency)}{Number(a.amount).toFixed(2)}
                  {a.note ? ` — ${a.note}` : ""}
                  {a.liquidationId ? <Badge variant="outline" className="ml-2">Ya aplicado</Badge> : null}
                </span>
                {!a.liquidationId && (
                  <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-bg" disabled={busy} onClick={() => run(() => adminApi.deleteTeacherAdvance(a.id))}>
                    Eliminar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <Input type="number" min="0" step="0.01" placeholder="Monto" className="w-32" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input placeholder="Nota (opcional)" className="max-w-xs" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button
            size="sm"
            disabled={busy || !amount}
            onClick={() => {
              run(() => adminApi.createTeacherAdvance({ teacherId, amount: Number(amount), note: note || undefined }));
              setAmount("");
              setNote("");
            }}
          >
            Otorgar adelanto
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function currencySymbol(currency: string) {
  return currency === "USD" ? "US$ " : "S/ ";
}

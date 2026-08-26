"use client";

import { useEffect, useState } from "react";
import { adminApi, ApiError } from "@/lib/api-client";
import { Select, Input, Label } from "@/components/ui/Input";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";
import { formatPrice } from "@/lib/format";

const CATEGORY_LABEL: Record<string, string> = {
  HOSTING: "Hosting/infraestructura",
  MARKETING: "Marketing",
  PAYROLL: "Planilla/docentes",
  OTHER: "Otros",
};

const GROUP_BY_LABEL: Record<string, string> = { day: "Diario", week: "Semanal", month: "Mensual", year: "Anual" };

function bucketLabel(iso: string, groupBy: string) {
  const d = new Date(iso);
  if (groupBy === "day") return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
  if (groupBy === "week") return `Semana del ${d.toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}`;
  if (groupBy === "year") return d.getFullYear().toString();
  return d.toLocaleDateString("es-PE", { month: "long", year: "numeric" });
}

/**
 * "Un botón de detalle para ver esas cifras que se encuentran generales
 * en el detalle de los ingresos y egresos separados por categoría, ya sea
 * diario, semanal, mensual, anual, o en las fechas que se estime" —
 * getFinancialSummary da un solo total agregado del rango completo; acá
 * se ve la evolución en el tiempo (cubos día/semana/mes/año) más el
 * desglose real de "otros gastos" por categoría (antes solo salía un
 * total ciego por moneda en /admin/finanzas).
 */
export function FinanceDetailManager() {
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month" | "year">("month");
  const [from, setFrom] = useState(new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    adminApi
      .financialDetail({ from, to, groupBy })
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No pudimos cargar el detalle."))
      .finally(() => setLoading(false));
  }, [from, to, groupBy]);

  // Une ingresos y egresos por (bucket, currency) en una sola fila para la tabla.
  const rows = (() => {
    if (!data) return [];
    const map = new Map<string, { bucket: string; currency: string; income: number; expenses: number }>();
    for (const b of data.income as Array<{ bucket: string; currency: string; amount: number }>) {
      const key = `${b.bucket}|${b.currency}`;
      const row = map.get(key) ?? { bucket: b.bucket, currency: b.currency, income: 0, expenses: 0 };
      row.income += b.amount;
      map.set(key, row);
    }
    for (const b of data.expenses as Array<{ bucket: string; currency: string; amount: number }>) {
      const key = `${b.bucket}|${b.currency}`;
      const row = map.get(key) ?? { bucket: b.bucket, currency: b.currency, income: 0, expenses: 0 };
      row.expenses += b.amount;
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => (a.bucket < b.bucket ? -1 : 1));
  })();

  return (
    <div className="flex flex-col gap-6">
      {error && <Callout variant="danger">{error}</Callout>}

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-6">
          <div>
            <Label htmlFor="fd-from">Desde</Label>
            <Input id="fd-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="fd-to">Hasta</Label>
            <Input id="fd-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="fd-groupby">Agrupar por</Label>
            <Select id="fd-groupby" value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}>
              {Object.entries(GROUP_BY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 font-serif text-lg font-semibold text-ink-900">Ingresos y egresos en el tiempo</h2>
          {loading ? (
            <p className="text-sm text-ash-500">Cargando…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-ash-500">No hay movimientos en este rango.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-paper-border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-paper-border bg-paper-muted text-xs uppercase tracking-wide text-ash-500">
                    <th className="p-3">Periodo</th>
                    <th className="p-3">Moneda</th>
                    <th className="p-3">Ingresos</th>
                    <th className="p-3">Egresos</th>
                    <th className="p-3">Neto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-paper-border">
                  {rows.map((r) => (
                    <tr key={`${r.bucket}|${r.currency}`}>
                      <td className="p-3 font-medium text-ink-900">{bucketLabel(r.bucket, groupBy)}</td>
                      <td className="p-3 text-ash-600">{r.currency}</td>
                      <td className="p-3 text-success">{formatPrice(r.income.toString(), r.currency, "es")}</td>
                      <td className="p-3 text-danger">{formatPrice(r.expenses.toString(), r.currency, "es")}</td>
                      <td className={`p-3 font-semibold ${r.income - r.expenses >= 0 ? "text-ink-900" : "text-danger"}`}>
                        {formatPrice((r.income - r.expenses).toString(), r.currency, "es")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 font-serif text-lg font-semibold text-ink-900">Otros gastos por categoría (en el rango elegido)</h2>
          {loading ? (
            <p className="text-sm text-ash-500">Cargando…</p>
          ) : !data?.expensesByCategory?.length ? (
            <p className="text-sm text-ash-500">No hay gastos manuales registrados en este rango.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-paper-border">
              {data.expensesByCategory.map((e: any, i: number) => (
                <li key={i} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-ink-800">{CATEGORY_LABEL[e.category] ?? e.category}</span>
                  <span className="font-medium text-ink-900">{formatPrice(e.amount.toString(), e.currency, "es")}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-ash-500">
            Convenios institucionales, regalías y horas dictadas por docentes se ven desglosados por curso en /admin/finanzas más abajo (sección
            "Otros gastos").
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

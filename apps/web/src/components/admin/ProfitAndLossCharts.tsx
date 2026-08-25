"use client";

import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";
import { TrendingUp, TrendingDown, Scale, Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { formatPrice } from "@/lib/format";

const STATUS_COPY: Record<string, { label: string; color: string; bg: string }> = {
  SUPERAVIT: { label: "Superávit", color: "text-success", bg: "bg-success-bg" },
  DEFICIT: { label: "Déficit", color: "text-danger", bg: "bg-danger-bg" },
  EQUILIBRIO: { label: "En equilibrio", color: "text-warning", bg: "bg-warning-bg" },
};

function monthLabel(month: string) {
  const [y, m] = month.split("-");
  const names = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${names[Number(m) - 1]} ${y.slice(2)}`;
}

/**
 * Estado de resultados muy visual, poco texto — "que el sistema calcule
 * punto de equilibrio, si estamos en superávit, déficit, pronostique
 * cuánto debería ser el crecimiento mensual". Todo en soles (PEN), el
 * negocio recurrente real.
 */
export function ProfitAndLossCharts({ data, locale }: { data: any; locale: string }) {
  const chartData = data.months.map((m: any) => ({ ...m, label: monthLabel(m.month) }));
  const lastMonth = data.months[data.months.length - 1];
  const status = STATUS_COPY[data.status] ?? STATUS_COPY.EQUILIBRIO;
  const breakEvenPct = data.breakEvenIncome && data.breakEvenIncome > 0 ? Math.min(200, (lastMonth.income / data.breakEvenIncome) * 100) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className={status.bg}>
          <CardContent className="p-5">
            <Scale className={`h-5 w-5 ${status.color}`} aria-hidden="true" />
            <p className={`mt-3 font-serif text-xl font-semibold ${status.color}`}>{formatPrice(lastMonth.profit, "PEN", locale)}</p>
            <p className="text-sm text-ash-500">{status.label} este mes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <Target className="h-5 w-5 text-ink-700" aria-hidden="true" />
            <p className="mt-3 font-serif text-xl font-semibold text-ink-900">
              {data.breakEvenIncome ? formatPrice(data.breakEvenIncome, "PEN", locale) : "—"}
            </p>
            <p className="text-sm text-ash-500">Punto de equilibrio mensual</p>
            {breakEvenPct !== null && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-paper-muted">
                <div
                  className={`h-full ${breakEvenPct >= 100 ? "bg-success" : "bg-warning"}`}
                  style={{ width: `${Math.min(100, breakEvenPct)}%` }}
                />
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            {(data.avgGrowthPct ?? 0) >= 0 ? (
              <TrendingUp className="h-5 w-5 text-success" aria-hidden="true" />
            ) : (
              <TrendingDown className="h-5 w-5 text-danger" aria-hidden="true" />
            )}
            <p className="mt-3 font-serif text-xl font-semibold text-ink-900">
              {data.avgGrowthPct !== null ? `${data.avgGrowthPct >= 0 ? "+" : ""}${data.avgGrowthPct.toFixed(1)}%` : "—"}
            </p>
            <p className="text-sm text-ash-500">Crecimiento mensual promedio</p>
            {data.avgGrowthPct === null && <p className="mt-1 text-xs text-ash-400">Faltan meses con ventas para calcular una tendencia.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <TrendingUp className="h-5 w-5 text-ink-700" aria-hidden="true" />
            <p className="mt-3 font-serif text-xl font-semibold text-ink-900">
              {data.forecastNextMonth !== null ? formatPrice(data.forecastNextMonth, "PEN", locale) : "—"}
            </p>
            <p className="text-sm text-ash-500">Proyección próximo mes</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6">
          <h3 className="mb-4 font-serif text-lg font-semibold text-ink-900">Ingresos vs. gastos vs. utilidad</h3>
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d5" />
              <XAxis dataKey="label" fontSize={12} stroke="#8a8a94" />
              <YAxis fontSize={12} stroke="#8a8a94" width={60} />
              <Tooltip formatter={(v: any) => `S/ ${Number(v).toLocaleString("es-PE", { maximumFractionDigits: 0 })}`} />
              <Legend />
              {data.breakEvenIncome && (
                <ReferenceLine y={data.breakEvenIncome} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: "Equilibrio", fontSize: 11, fill: "#b45309" }} />
              )}
              <Bar dataKey="income" name="Ingresos" fill="#586bd8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" name="Gastos" fill="#dc2626" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="profit" name="Utilidad" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="mt-3 text-xs text-ash-500">
            Gastos fijos mensuales estimados: {formatPrice(data.monthlyFixedCosts, "PEN", locale)} (gastos "Mensual" + "Anual" prorrateado ÷12,
            tomados como constantes en toda la ventana — no hay historial de gastos previo a hoy). Costo variable estimado por venta:{" "}
            {data.variableRatePercent.toFixed(1)}% (comisión de pasarela + IGV si aplica).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

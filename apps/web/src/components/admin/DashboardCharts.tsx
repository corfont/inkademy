"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Card, CardContent } from "@/components/ui/Card";
import { adminApi } from "@/lib/api-client";
import { Select } from "@/components/ui/Input";

const STATUS_LABEL: Record<string, string> = { ACTIVE: "En curso", COMPLETED: "Completado", EXPIRED: "Vencido", CANCELLED: "Cancelado" };

const TICKET_STATUS_LABEL: Record<string, string> = {
  OPEN: "Abierto",
  IN_PROGRESS: "En progreso",
  WAITING_USER: "Esperando alumno",
  RESOLVED: "Resuelto",
  CLOSED: "Cerrado",
};

// "#586bd8"/"#d8b16c" eran los hex fijos de indigo-400/gold-400 — no
// reaccionaban a modo oscuro. Se resuelven las custom properties reales
// (hsl() sin envolver, ver globals.css) en tiempo de montaje, cuando el DOM
// ya está pintado y getComputedStyle puede leerlas.
function useBrandChartColors() {
  const [colors, setColors] = useState({ indigo: "#586bd8", gold: "#d8b16c" });
  useEffect(() => {
    const styles = getComputedStyle(document.documentElement);
    const indigo = styles.getPropertyValue("--indigo-400").trim();
    const gold = styles.getPropertyValue("--gold-400").trim();
    setColors({
      indigo: indigo ? `hsl(${indigo})` : "#586bd8",
      gold: gold ? `hsl(${gold})` : "#d8b16c",
    });
  }, []);
  return colors;
}

function monthLabel(month: string) {
  const [y, m] = month.split("-");
  const names = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${names[Number(m) - 1]} ${y.slice(2)}`;
}

export function DashboardCharts({
  data: initialData,
  ticketsByStatus,
}: {
  data: {
    revenueByMonth: { month: string; total: number }[];
    enrollmentsByMonth: { month: string; count: number }[];
    enrollmentsByStatus: { status: string; count: number }[];
    coursesByArea: { area: string; count: number }[];
  };
  ticketsByStatus: { status: string; count: number }[];
}) {
  const { indigo, gold } = useBrandChartColors();
  // Horizonte de las series de tiempo: el admin elige cuántos meses mirar (antes fijo en 6).
  const [months, setMonths] = useState(6);
  const [data, setData] = useState(initialData);
  const [loadingRange, setLoadingRange] = useState(false);
  async function changeMonths(m: number) {
    setMonths(m);
    setLoadingRange(true);
    try {
      const fresh = await adminApi.kpiCharts(undefined, m);
      setData((d) => ({ ...d, revenueByMonth: fresh.revenueByMonth ?? d.revenueByMonth, enrollmentsByMonth: fresh.enrollmentsByMonth ?? d.enrollmentsByMonth }));
    } catch {
      /* se conserva lo que ya se veía */
    } finally {
      setLoadingRange(false);
    }
  }
  const pctLabel = (name: string) => (entry: any) => `${name} ${Math.round((entry.percent ?? 0) * 100)}%`;
  const STATUS_COLOR: Record<string, string> = {
    ACTIVE: indigo, // indigo — en curso
    COMPLETED: "#16a34a", // verde — completado
    EXPIRED: "#f59e0b", // ámbar — vencido
    CANCELLED: "#dc2626", // rojo — cancelado
  };
  const TICKET_STATUS_COLOR: Record<string, string> = {
    OPEN: "#dc2626",
    IN_PROGRESS: "#f59e0b",
    WAITING_USER: indigo,
    RESOLVED: "#16a34a",
    CLOSED: "#6b7280",
  };
  const revenue = data.revenueByMonth.map((r) => ({ ...r, label: monthLabel(r.month) }));
  const enrollments = data.enrollmentsByMonth.map((r) => ({ ...r, label: monthLabel(r.month) }));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex items-center justify-end gap-2 lg:col-span-2">
        <label htmlFor="kpi-months" className="text-sm text-ash-600">Horizonte de las series de tiempo</label>
        <Select id="kpi-months" className="h-9 w-40" value={months} disabled={loadingRange} onChange={(e) => changeMonths(Number(e.target.value))}>
          <option value={3}>Últimos 3 meses</option>
          <option value={6}>Últimos 6 meses</option>
          <option value={12}>Últimos 12 meses</option>
          <option value={24}>Últimos 24 meses</option>
        </Select>
      </div>
      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 font-serif text-lg font-semibold text-ink-900">Ventas pagadas — últimos {months} meses</h2>
          {revenue.length === 0 ? (
            <p className="text-sm text-ash-500">Todavía no hay ventas pagadas en este período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={revenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d5" />
                <XAxis dataKey="label" fontSize={12} stroke="#8a8a94" />
                <YAxis fontSize={12} stroke="#8a8a94" width={50} />
                <Tooltip formatter={(v: any) => [`S/ ${Number(v).toLocaleString("es-PE")}`, "Ventas"]} />
                <Line type="monotone" dataKey="total" stroke={indigo} strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 font-serif text-lg font-semibold text-ink-900">Nuevas matrículas — últimos {months} meses</h2>
          {enrollments.length === 0 ? (
            <p className="text-sm text-ash-500">Todavía no hay matrículas en este período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={enrollments}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d5" />
                <XAxis dataKey="label" fontSize={12} stroke="#8a8a94" />
                <YAxis fontSize={12} stroke="#8a8a94" width={40} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" name="Matrículas" fill={gold} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 font-serif text-lg font-semibold text-ink-900">Matrículas por estado</h2>
          {data.enrollmentsByStatus.length === 0 ? (
            <p className="text-sm text-ash-500">Sin datos todavía.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data.enrollmentsByStatus}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={(entry: any) => pctLabel(STATUS_LABEL[entry.status] ?? entry.status)(entry)}
                >
                  {data.enrollmentsByStatus.map((entry) => (
                    <Cell key={entry.status} fill={STATUS_COLOR[entry.status] ?? "#8a8a94"} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any, _n: any, entry: any) => [v, STATUS_LABEL[entry?.payload?.status] ?? entry?.payload?.status]} />
                <Legend formatter={(value: any) => STATUS_LABEL[value] ?? value} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 font-serif text-lg font-semibold text-ink-900">Cursos publicados por área</h2>
          {data.coursesByArea.length === 0 ? (
            <p className="text-sm text-ash-500">Sin cursos publicados todavía.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={data.coursesByArea} dataKey="count" nameKey="area" cx="50%" cy="50%" outerRadius={80} label={(entry: any) => pctLabel(entry.area)(entry)}>
                  {data.coursesByArea.map((entry) => (
                    <Cell key={entry.area} fill={hexFromToken(entry.area)} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {ticketsByStatus.length > 0 && (
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <h2 className="mb-4 font-serif text-lg font-semibold text-ink-900">Tickets de soporte por estado</h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={ticketsByStatus} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d5" />
                <XAxis type="number" fontSize={12} stroke="#8a8a94" allowDecimals={false} />
                <YAxis type="category" dataKey="status" tickFormatter={(v: any) => TICKET_STATUS_LABEL[v] ?? v} fontSize={12} width={110} stroke="#8a8a94" />
                <Tooltip formatter={(v: any) => [v, "Tickets"]} labelFormatter={(v: any) => TICKET_STATUS_LABEL[v] ?? v} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {ticketsByStatus.map((entry) => (
                    <Cell key={entry.status} fill={TICKET_STATUS_COLOR[entry.status] ?? "#8a8a94"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Paletas de Tailwind ya traen su valor hex real vía clases; como recharts
// necesita un color CSS directo (no una clase), se mapea la misma paleta
// determinística de category-colors.ts a sus valores hex equivalentes.
const HEX_PALETTE = ["#e11d48", "#d97706", "#059669", "#0284c7", "#7c3aed", "#0d9488", "#ea580c", "#c026d3", "#0891b2", "#65a30d"];
function hexFromToken(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return HEX_PALETTE[hash % HEX_PALETTE.length];
}

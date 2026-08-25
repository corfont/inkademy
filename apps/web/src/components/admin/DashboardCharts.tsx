"use client";

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

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "#586bd8", // indigo — en curso
  COMPLETED: "#16a34a", // verde — completado
  EXPIRED: "#f59e0b", // ámbar — vencido
  CANCELLED: "#dc2626", // rojo — cancelado
};
const STATUS_LABEL: Record<string, string> = { ACTIVE: "En curso", COMPLETED: "Completado", EXPIRED: "Vencido", CANCELLED: "Cancelado" };

const TICKET_STATUS_COLOR: Record<string, string> = {
  OPEN: "#dc2626",
  IN_PROGRESS: "#f59e0b",
  WAITING_USER: "#586bd8",
  RESOLVED: "#16a34a",
  CLOSED: "#6b7280",
};
const TICKET_STATUS_LABEL: Record<string, string> = {
  OPEN: "Abierto",
  IN_PROGRESS: "En progreso",
  WAITING_USER: "Esperando alumno",
  RESOLVED: "Resuelto",
  CLOSED: "Cerrado",
};

function monthLabel(month: string) {
  const [y, m] = month.split("-");
  const names = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  return `${names[Number(m) - 1]} ${y.slice(2)}`;
}

export function DashboardCharts({
  data,
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
  const revenue = data.revenueByMonth.map((r) => ({ ...r, label: monthLabel(r.month) }));
  const enrollments = data.enrollmentsByMonth.map((r) => ({ ...r, label: monthLabel(r.month) }));

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 font-serif text-lg font-semibold text-ink-900">Ventas pagadas — últimos 6 meses</h2>
          {revenue.length === 0 ? (
            <p className="text-sm text-ash-500">Todavía no hay ventas pagadas en este período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={revenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d5" />
                <XAxis dataKey="label" fontSize={12} stroke="#8a8a94" />
                <YAxis fontSize={12} stroke="#8a8a94" width={50} />
                <Tooltip formatter={(v: any) => [`S/ ${Number(v).toLocaleString("es-PE")}`, "Ventas"]} />
                <Line type="monotone" dataKey="total" stroke="#586bd8" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 font-serif text-lg font-semibold text-ink-900">Nuevas matrículas — últimos 6 meses</h2>
          {enrollments.length === 0 ? (
            <p className="text-sm text-ash-500">Todavía no hay matrículas en este período.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={enrollments}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e0d5" />
                <XAxis dataKey="label" fontSize={12} stroke="#8a8a94" />
                <YAxis fontSize={12} stroke="#8a8a94" width={40} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" name="Matrículas" fill="#d8b16c" radius={[4, 4, 0, 0]} />
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
                  label={(entry: any) => STATUS_LABEL[entry.status] ?? entry.status}
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
                <Pie data={data.coursesByArea} dataKey="count" nameKey="area" cx="50%" cy="50%" outerRadius={80} label={(entry: any) => entry.area}>
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

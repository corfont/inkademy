"use client";

import { useEffect, useState } from "react";
import { notificationsApi, ApiError } from "@/lib/api-client";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

const STATUS: Record<string, { label: string; variant: "success" | "warning" | "danger" }> = {
  SENT: { label: "Enviado", variant: "success" },
  PENDING: { label: "Pendiente", variant: "warning" },
  FAILED: { label: "Falló", variant: "danger" },
};
const CHANNEL: Record<string, string> = { EMAIL: "Correo", IN_APP: "En la plataforma" };

/** Qué evento, a quién, por qué canal, cuándo y con qué resultado: la forma de comprobar que los avisos de verdad se generan y llegan. */
export function NotificationLogViewer() {
  const [channel, setChannel] = useState("");
  const [status, setStatus] = useState("");
  const [template, setTemplate] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: any[]; total: number; pageSize: number; failedLast7d: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  async function load(nextPage = page) {
    setLoading(true);
    setError(null);
    try {
      const r = await notificationsApi.log({ channel: channel || undefined, status: status || undefined, template: template || undefined, from: from || undefined, to: to || undefined, page: nextPage });
      setData(r);
      setPage(nextPage);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo cargar el historial.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendTest() {
    setTesting(true);
    setTestMsg(null);
    try {
      const r = await notificationsApi.sendTest();
      setTestMsg(`Correo de prueba en camino a ${r.to}. En unos segundos aparecerá abajo con su resultado.`);
      setTimeout(() => load(1), 4000);
    } catch (err) {
      setTestMsg(err instanceof ApiError ? err.message : "No se pudo enviar la prueba.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg font-semibold text-ink-900">Historial y prueba de envíos</h2>
          <p className="text-sm text-ash-500">Las casillas de arriba expresan una configuración; aquí se comprueba que los avisos se generen y lleguen.</p>
        </div>
        <Button size="sm" disabled={testing} onClick={sendTest}>{testing ? "Enviando…" : "Enviarme un correo de prueba"}</Button>
      </div>
      {testMsg && <Callout variant="info">{testMsg}</Callout>}
      {data && data.failedLast7d > 0 && <Callout variant="warning">{data.failedLast7d} envío(s) fallaron en los últimos 7 días. Revisa el motivo en la lista (filtra por «Falló»).</Callout>}

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-5">
          <div>
            <Label htmlFor="nl-channel">Canal</Label>
            <Select id="nl-channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="">Todos</option>
              <option value="EMAIL">Correo</option>
              <option value="IN_APP">En la plataforma</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="nl-status">Resultado</Label>
            <Select id="nl-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="SENT">Enviado</option>
              <option value="PENDING">Pendiente</option>
              <option value="FAILED">Falló</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="nl-template">Evento (contiene)</Label>
            <Input id="nl-template" value={template} onChange={(e) => setTemplate(e.target.value)} placeholder="ej. certificate" />
          </div>
          <div>
            <Label htmlFor="nl-from">Desde</Label>
            <Input id="nl-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="nl-to">Hasta</Label>
            <Input id="nl-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="sm:col-span-5">
            <Button size="sm" variant="outline" disabled={loading} onClick={() => load(1)}>{loading ? "Buscando…" : "Filtrar"}</Button>
          </div>
        </CardContent>
      </Card>

      {error && <Callout variant="danger">{error}</Callout>}
      <div className="overflow-x-auto rounded-lg border border-paper-border bg-paper">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-paper-border text-ash-500">
            <tr>
              <th className="p-3 font-medium">Fecha</th>
              <th className="p-3 font-medium">Evento</th>
              <th className="p-3 font-medium">Destinatario</th>
              <th className="p-3 font-medium">Canal</th>
              <th className="p-3 font-medium">Resultado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-border">
            {(data?.rows ?? []).length === 0 && (
              <tr><td colSpan={5} className="p-4 text-center text-ash-500">{loading ? "Cargando…" : "No hay envíos con estos filtros."}</td></tr>
            )}
            {(data?.rows ?? []).map((n) => (
              <tr key={n.id}>
                <td className="p-3 whitespace-nowrap text-ash-600">{new Date(n.createdAt).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" })}</td>
                <td className="p-3 text-ink-800">{n.template}{n.title ? <span className="block text-ash-500">{n.title}</span> : null}</td>
                <td className="p-3 text-ash-700">{n.recipient.name}<span className="block text-ash-500">{n.recipient.email}</span></td>
                <td className="p-3 text-ash-600">{CHANNEL[n.channel] ?? n.channel}</td>
                <td className="p-3">
                  <Badge variant={STATUS[n.status]?.variant ?? "warning"}>{STATUS[n.status]?.label ?? n.status}</Badge>
                  {n.attempts > 1 && <span className="ml-1 text-ash-500">{n.attempts} intentos</span>}
                  {n.errorMessage && <span className="mt-1 block max-w-xs break-words text-danger">{n.errorMessage}</span>}
                  {n.status === "SENT" && n.sentAt && <span className="block text-ash-500">{new Date(n.sentAt).toLocaleTimeString("es-PE", { timeStyle: "short" })}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-center gap-3">
          <Button size="sm" variant="outline" disabled={loading || page <= 1} onClick={() => load(page - 1)}>Anterior</Button>
          <span className="text-xs text-ash-500">Página {page} de {Math.ceil(data.total / data.pageSize)}</span>
          <Button size="sm" variant="outline" disabled={loading || page * data.pageSize >= data.total} onClick={() => load(page + 1)}>Siguiente</Button>
        </div>
      )}
    </div>
  );
}

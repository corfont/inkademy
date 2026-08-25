"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { adminApi, ApiError } from "@/lib/api-client";
import { getClientAccessToken } from "@/lib/auth";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";

/**
 * Selector de periodo (últimos 30 días / último año / todo / por año) +
 * exportar a PDF o mandar por correo — "esto me debería permitir
 * descargarlo o pasarlo a PDF o mandarlo por correo. La visualización
 * puede ser los últimos 30 días, o el último año o todo, o hacer balances
 * por año".
 */
export function FinanceExportControls({ availableYears }: { availableYears: number[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const period = searchParams.get("period") ?? "last30d";
  const year = searchParams.get("year") ?? String(availableYears[0] ?? new Date().getFullYear());

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function setPeriod(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", next);
    if (next === "year") params.set("year", year);
    router.push(`?${params.toString()}`);
  }

  function currentParams() {
    return { period, year: period === "year" ? Number(year) : undefined };
  }

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      const token = getClientAccessToken();
      if (!token) throw new ApiError(401, "Inicia sesión de nuevo.");
      await adminApi.downloadFinancialReportPdf(currentParams(), token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos generar el PDF.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleEmail() {
    setSending(true);
    setError(null);
    setSent(false);
    try {
      await adminApi.emailFinancialReport({ recipientEmail: email, ...currentParams() });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos enviar el correo.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-paper-border bg-paper-muted p-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-ash-600">Periodo</label>
        <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-48">
          <option value="last30d">Últimos 30 días</option>
          <option value="lastYear">Último año</option>
          <option value="allTime">Todo</option>
          <option value="year">Balance por año…</option>
        </Select>
      </div>
      {period === "year" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-ash-600">Año</label>
          <Select
            value={year}
            onChange={(e) => {
              const params = new URLSearchParams(searchParams.toString());
              params.set("period", "year");
              params.set("year", e.target.value);
              router.push(`?${params.toString()}`);
            }}
            className="w-28"
          >
            {(availableYears.length ? availableYears : [new Date().getFullYear()]).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
      )}
      <Button size="sm" variant="outline" disabled={downloading} onClick={handleDownload}>
        {downloading ? "Generando…" : "Descargar PDF"}
      </Button>
      <div className="flex items-end gap-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-ash-600">Enviar por correo a</label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" className="w-56" />
        </div>
        <Button size="sm" variant="outline" disabled={sending || !email} onClick={handleEmail}>
          {sending ? "Enviando…" : sent ? "Enviado ✓" : "Enviar"}
        </Button>
      </div>
      {error && <Callout variant="danger">{error}</Callout>}
    </div>
  );
}

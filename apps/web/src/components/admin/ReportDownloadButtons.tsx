"use client";

import { useState } from "react";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { adminApi, ApiError } from "@/lib/api-client";
import { getClientAccessToken } from "@/lib/auth";
import { Button } from "@/components/ui/Button";

/** Botones «Descargar PDF» y «Descargar Excel» de un reporte, con los filtros que tenga la pantalla (periodo, docente, curso). */
export function ReportDownloadButtons({ reportKey, params = {} }: { reportKey: string; params?: Record<string, string | undefined> }) {
  const [busy, setBusy] = useState<"pdf" | "xlsx" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(format: "pdf" | "xlsx") {
    setBusy(format);
    setError(null);
    try {
      const token = getClientAccessToken();
      if (!token) throw new ApiError(401, "Tu sesión expiró. Inicia sesión de nuevo.");
      await adminApi.downloadReport(reportKey, format, params, token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos generar el archivo.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => go("pdf")}>
        <FileDown className="mr-1.5 h-4 w-4" aria-hidden="true" />
        {busy === "pdf" ? "Generando…" : "Descargar PDF"}
      </Button>
      <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => go("xlsx")}>
        <FileSpreadsheet className="mr-1.5 h-4 w-4" aria-hidden="true" />
        {busy === "xlsx" ? "Generando…" : "Descargar Excel"}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

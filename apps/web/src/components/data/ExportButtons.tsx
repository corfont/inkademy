"use client";

import { useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { adminApi, ApiError } from "@/lib/api-client";
import { getClientAccessToken } from "@/lib/auth";
import { Button } from "@/components/ui/Button";

/**
 * «Descargar Excel» y «Descargar CSV» de un listado (COMPLETITUD.md: TBL-40, REP-01/02). Exporta el MISMO conjunto filtrado y ordenado que se ve
 * en pantalla (los parámetros de la URL), no solo la página actual. El servidor lo audita y rechaza conjuntos demasiado grandes con un mensaje.
 */
export function ExportButtons({ path, params }: { path: string; params: Record<string, string> }) {
  const [busy, setBusy] = useState<"xlsx" | "csv" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(format: "xlsx" | "csv") {
    setBusy(format);
    setError(null);
    try {
      const token = getClientAccessToken();
      if (!token) throw new ApiError(401, "Tu sesión expiró. Inicia sesión de nuevo.");
      // page/pageSize no se mandan: la exportación NO está paginada.
      const { page: _page, pageSize: _pageSize, ...filters } = params;
      await adminApi.downloadList(`${path}.${format}`, filters, token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos generar el archivo.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => go("xlsx")}>
          <FileSpreadsheet className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {busy === "xlsx" ? "Generando…" : "Excel"}
        </Button>
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => go("csv")}>
          <FileText className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {busy === "csv" ? "Generando…" : "CSV"}
        </Button>
      </div>
      {error && <p role="alert" className="max-w-sm text-right text-xs text-danger">{error}</p>}
    </div>
  );
}

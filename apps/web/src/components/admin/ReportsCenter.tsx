"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { adminApi, ApiError } from "@/lib/api-client";
import { getClientAccessToken } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";

/**
 * "El sistema en alguna parte me debería emitir reportes en PDF... muy
 * profesionales, con dashboard, logo, A4, Trebuchet 11 justificado,
 * márgenes 2.5cm, sello de agua..." — un solo lugar con todos los
 * reportes descargables (los que pidió + los que se sugirieron), en vez
 * de un botón suelto por pantalla.
 */
export function ReportsCenter({ catalog }: { catalog: { key: string; label: string; description: string }[] }) {
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(key: string) {
    setError(null);
    setDownloadingKey(key);
    try {
      const token = getClientAccessToken();
      if (!token) throw new ApiError(401, "Sesión expirada.");
      await adminApi.downloadReportPdf(key, {}, token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos generar el reporte.");
    } finally {
      setDownloadingKey(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Callout variant="danger">{error}</Callout>}
      <div className="grid gap-4 sm:grid-cols-2">
        {catalog.map((r) => (
          <Card key={r.key}>
            <CardContent className="flex flex-col gap-3 p-5">
              <div>
                <h3 className="font-serif text-base font-semibold text-ink-900">{r.label}</h3>
                <p className="mt-1 text-xs text-ash-500">{r.description}</p>
              </div>
              <Button size="sm" variant="outline" disabled={downloadingKey === r.key} onClick={() => download(r.key)} className="self-start">
                <FileDown className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {downloadingKey === r.key ? "Generando…" : "Descargar PDF"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

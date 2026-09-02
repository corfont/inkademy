"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { adminApi, ApiError, type BackupRecordDTO } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

const STATUS_VARIANT: Record<string, "success" | "warning" | "outline" | "danger"> = {
  PENDING: "outline",
  RUNNING: "warning",
  DONE: "success",
  FAILED: "danger",
};

const STATUS_LABEL: Record<string, string> = { PENDING: "Pendiente", RUNNING: "Generando…", DONE: "Listo", FAILED: "Falló" };

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

/**
 * "Toda la base de datos... que si se pierde lo pueda recuperar" — export
 * completo (todos los modelos + certificados/firmas de convenios/facturas
 * embebidos) generado en segundo plano por el worker, ver
 * apps/worker/src/lib/backup.ts. El botón solo encola; el estado real se
 * ve acá cuando `router.refresh()` (poll manual, no hace falta tiempo real
 * para algo que tarda segundos, no milisegundos).
 */
export function BackupManager({ backups }: { backups: BackupRecordDTO[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const hasPending = backups.some((b) => b.status === "PENDING" || b.status === "RUNNING");

  async function handleGenerate() {
    setBusy(true);
    setError(null);
    try {
      await adminApi.generateBackupNow();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo encolar el backup.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload(id: string) {
    setDownloadingId(id);
    setError(null);
    try {
      const { url } = await adminApi.getBackupDownloadUrl(id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo generar el enlace de descarga.");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-lg font-semibold text-ink-900">Backups</h2>
        <Button size="sm" disabled={busy || hasPending} onClick={handleGenerate}>
          {hasPending ? "Ya hay uno en curso…" : busy ? "Encolando…" : "Generar backup ahora"}
        </Button>
      </div>

      <Callout variant="warning">
        Este archivo contiene información sensible completa (contraseñas, claves SUNAT, datos bancarios) — guárdalo con cuidado. Se genera
        automáticamente cada semana además de poder pedirlo aquí; solo un ADMIN puede verlo o descargarlo.
      </Callout>

      {error && <Callout variant="danger">{error}</Callout>}

      {backups.length === 0 ? (
        <p className="text-sm text-ash-500">Todavía no se generó ningún backup.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {backups.map((b) => (
            <Card key={b.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink-900">{new Date(b.createdAt).toLocaleString("es-PE")}</span>
                    <Badge variant={STATUS_VARIANT[b.status]}>{STATUS_LABEL[b.status]}</Badge>
                  </div>
                  <p className="text-xs text-ash-500">
                    {b.trigger === "MANUAL" ? "Manual" : "Automático (semanal)"}
                    {b.triggeredBy && ` — ${b.triggeredBy.firstName} ${b.triggeredBy.lastName}`}
                    {b.status === "DONE" && ` · ${formatBytes(b.sizeBytes)}`}
                    {b.status === "DONE" && b.modelCounts && ` · ${Object.keys(b.modelCounts).length} tablas`}
                    {b.status === "FAILED" && b.errorMessage && ` · ${b.errorMessage}`}
                  </p>
                </div>
                {b.status === "DONE" && (
                  <Button size="sm" variant="outline" disabled={downloadingId === b.id} onClick={() => handleDownload(b.id)}>
                    <Download className="h-4 w-4" aria-hidden="true" />
                    {downloadingId === b.id ? "Abriendo…" : "Descargar"}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

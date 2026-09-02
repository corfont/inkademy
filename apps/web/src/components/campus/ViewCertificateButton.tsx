"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { certificateApi, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";

/**
 * Antes el botón "Descargar" era un `<a href={cert.pdfUrl}>` directo a la
 * URL pública del storage — cualquier error del storage (ej.
 * "MetadataTooLarge") le llegaba al alumno como XML crudo, sin pasar por
 * la app. Ahora se pide primero la URL firmada al backend (con el mismo
 * chequeo de dueño de siempre) y recién ahí se navega.
 */
export function ViewCertificateButton({ certificateId, label }: { certificateId: string; label: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const { url } = await certificateApi.getDownloadUrl(certificateId);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos abrir el certificado. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="outline" onClick={handleClick} disabled={loading}>
        <Download className="h-4 w-4" aria-hidden="true" />
        {loading ? "Abriendo…" : label}
      </Button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

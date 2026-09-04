"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/ErrorState";

/**
 * Boundary de error para todo el segmento /campus/*.
 *
 * `withFallback` (ver src/lib/safe-fetch.ts) relanza los errores HTTP reales
 * de la API (401/403/...) en vez de disfrazarlos con datos simulados. Las
 * páginas de /campus leen el access token de una cookie legible de corta
 * duración (`inkademy_at`, 15 min — ver auth.ts) y llaman a la API server-side
 * con él; si expiró (o nunca existió, p.ej. enlace directo sin sesión), la
 * API responde 401 y ese throw explota el render sin este boundary. Antes
 * de este archivo, cualquier alumno con la sesión vencida veía el overlay de
 * error genérico de Next en vez de que se le pidiera volver a iniciar sesión.
 */
export default function CampusError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      title="No pudimos cargar tu campus"
      message="Tu sesión pudo haber expirado, o hubo un problema temporal para conectar con la API. Intenta de nuevo o vuelve a iniciar sesión."
      onRetry={reset}
      secondaryHref="/login"
      secondaryLabel="Iniciar sesión"
    />
  );
}

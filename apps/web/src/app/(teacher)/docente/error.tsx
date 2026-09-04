"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/ErrorState";

/**
 * Boundary de error para todo el segmento /docente/* — faltaba (a diferencia
 * de /campus y /admin, que ya lo tenían de una sesión anterior). Mismo
 * motivo: `withFallback` relanza los errores HTTP reales (401/403) en vez
 * de disfrazarlos con datos simulados, y el access token de la cookie
 * legible dura solo 15 min (ver auth.ts) — sin este boundary, una sesión
 * vencida reventaba con el overlay de error genérico de Next ("Error:
 * Unauthorized" crudo) en vez de ofrecer reintentar o volver a iniciar sesión.
 */
export default function TeacherError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      title="No pudimos cargar tu panel de docente"
      message="Tu sesión pudo haber expirado, o hubo un problema temporal para conectar con la API. Intenta de nuevo o vuelve a iniciar sesión."
      onRetry={reset}
      secondaryHref="/login"
      secondaryLabel="Iniciar sesión"
    />
  );
}

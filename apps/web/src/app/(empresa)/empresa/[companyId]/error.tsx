"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/ErrorState";

/**
 * Boundary de error para todo el segmento /empresa/[companyId]/*.
 *
 * `withFallback` (ver src/lib/safe-fetch.ts) relanza los errores HTTP reales
 * de la API (401/403/404/...) en vez de disfrazarlos con datos simulados —
 * a propósito, para no mostrarle un panel con apariencia real a alguien sin
 * acceso a esa empresa. Este boundary captura ese throw y muestra un estado
 * claro en vez del overlay de error genérico de Next.
 */
export default function EmpresaError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      title="No pudimos mostrar esta empresa"
      message="Puede que no tengas acceso a esta empresa, que el enlace sea incorrecto, o que haya ocurrido un problema temporal. Si el problema persiste, contacta a soporte."
      onRetry={reset}
      secondaryHref="/campus"
      secondaryLabel="Volver a mi campus"
    />
  );
}

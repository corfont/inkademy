"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/ErrorState";

/**
 * Boundary de error para todo el segmento /admin/*. Ver el comentario en
 * apps/web/src/app/(empresa)/empresa/[companyId]/error.tsx — mismo motivo:
 * `withFallback` relanza los errores HTTP reales (401/403) en vez de
 * disfrazarlos con datos simulados.
 */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      title="No pudimos cargar el panel de administración"
      message="Es posible que tu cuenta no tenga permisos de administrador, o que haya ocurrido un problema temporal."
      onRetry={reset}
      secondaryHref="/campus"
      secondaryLabel="Volver a mi campus"
    />
  );
}

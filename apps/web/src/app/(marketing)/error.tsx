"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/ErrorState";

/** Pantalla de error de marca (en vez de la pantalla cruda de Next). `digest` es el código que soporte puede buscar en los registros. */
export default function SegmentError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);
  return (
    <ErrorState
      title="Algo salió mal"
      message={`No pudimos cargar esta página. Intenta de nuevo; si el problema continúa, escríbenos desde el centro de ayuda${error.digest ? ` e indica el código ${error.digest}` : ""}.`}
      onRetry={reset}
      secondaryHref="/ayuda"
      secondaryLabel="Centro de ayuda"
    />
  );
}

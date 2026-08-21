"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

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
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">No pudimos mostrar esta empresa</h1>
      <p className="max-w-md text-ash-600">
        Puede que no tengas acceso a esta empresa, que el enlace sea incorrecto, o que haya ocurrido un problema
        temporal. Si el problema persiste, contacta a soporte.
      </p>
      <div className="flex gap-3">
        <Button variant="outline" onClick={reset}>
          Reintentar
        </Button>
        <Link href="/campus">
          <Button>Volver a mi campus</Button>
        </Link>
      </div>
    </div>
  );
}

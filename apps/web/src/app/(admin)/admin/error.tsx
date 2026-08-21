"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

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
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">No pudimos cargar el panel de administración</h1>
      <p className="max-w-md text-ash-600">
        Es posible que tu cuenta no tenga permisos de administrador, o que haya ocurrido un problema temporal.
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

"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

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
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">No pudimos cargar tu campus</h1>
      <p className="max-w-md text-ash-600">
        Tu sesión pudo haber expirado, o hubo un problema temporal para conectar con la API. Intenta de nuevo o vuelve
        a iniciar sesión.
      </p>
      <div className="flex gap-3">
        <Button variant="outline" onClick={reset}>
          Reintentar
        </Button>
        <Link href="/login">
          <Button>Iniciar sesión</Button>
        </Link>
      </div>
    </div>
  );
}

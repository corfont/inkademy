"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

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
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">No pudimos cargar tu panel de docente</h1>
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

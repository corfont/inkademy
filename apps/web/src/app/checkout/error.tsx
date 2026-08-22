"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

/**
 * Boundary de error para /checkout. Con el guard de middleware.ts (que ahora
 * exige sesión antes de entrar a /checkout) esto debería ser un caso raro
 * (p.ej. el token expiró justo mientras el visitante llenaba el formulario),
 * pero sin este boundary cualquier error no capturado aquí mostraba el
 * overlay crudo de Next en vez de un estado claro.
 */
export default function CheckoutError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">No pudimos completar tu compra</h1>
      <p className="max-w-md text-ash-600">
        Tu sesión pudo haber expirado mientras llenabas el formulario, o hubo un problema temporal. No se realizó
        ningún cargo. Vuelve a iniciar sesión e inténtalo de nuevo.
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

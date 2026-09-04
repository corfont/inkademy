"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/ErrorState";

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
    <ErrorState
      title="No pudimos completar tu compra"
      message="Tu sesión pudo haber expirado mientras llenabas el formulario, o hubo un problema temporal. No se realizó ningún cargo. Vuelve a iniciar sesión e inténtalo de nuevo."
      onRetry={reset}
      secondaryHref="/login"
      secondaryLabel="Iniciar sesión"
    />
  );
}

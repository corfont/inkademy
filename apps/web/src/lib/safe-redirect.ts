/**
 * Destino de redirección tras iniciar sesión / registrarse: solo se aceptan rutas internas ("/campus", "/checkout?x=1").
 * Un `?next=https://sitio-malo` o `?next=//sitio-malo` (open redirect) se descarta.
 */
export function safeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}

import Link from "next/link";
import { Button } from "@/components/ui/Button";

/**
 * Patrón `min-h-[60vh]` de título + mensaje + acciones, repetido antes en 5
 * Error Boundaries de Next distintos (uno por segmento: campus, admin,
 * checkout, empresa, docente) con solo el texto y los hrefs cambiando.
 *
 * No reemplaza la integración con Next: cada `error.tsx` sigue recibiendo
 * `error`/`reset` de Next y decide qué texto mostrar; acá solo vive el
 * layout visual compartido. `onRetry` normalmente es el `reset` que Next ya
 * pasa a esos boundaries.
 */
export function ErrorState({
  title,
  message,
  onRetry,
  retryLabel = "Reintentar",
  secondaryHref,
  secondaryLabel,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  const hasActions = Boolean(onRetry) || Boolean(secondaryHref && secondaryLabel);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">{title}</h1>
      <p className="max-w-md text-ash-600">{message}</p>
      {hasActions && (
        <div className="flex gap-3">
          {onRetry && (
            <Button variant="outline" onClick={onRetry}>
              {retryLabel}
            </Button>
          )}
          {secondaryHref && secondaryLabel && (
            <Link href={secondaryHref}>
              <Button>{secondaryLabel}</Button>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

import type { LucideIcon } from "lucide-react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * "La página de curso organizada como secuencia de acción: cada sección es
 * un banner de color con una instrucción en negrita, y cuando algo está
 * bloqueado lo dice explícitamente y con el motivo exacto" — inspirado en
 * formaciondocente.upn.edu.pe, adaptado a la paleta de Inkademy. Reemplaza
 * los `<section>` neutros del aula (Evaluaciones/Certificado) por un banner
 * con instrucción clara arriba y, si corresponde, el motivo puntual de
 * bloqueo abajo — en vez de un bloque de texto genérico.
 */
export function ActionSection({
  icon: Icon,
  instruction,
  tone = "ink",
  lockedReason,
  children,
}: {
  icon: LucideIcon;
  /** Instrucción corta y accionable, p.ej. "Aprueba tus evaluaciones para avanzar". */
  instruction: string;
  /** "ink" = acción pendiente normal, "success" = ya cumplido, "gold" = destacar (p.ej. certificado listo). */
  tone?: "ink" | "success" | "gold";
  /** Si viene, se muestra un pie con el motivo EXACTO de bloqueo — no un texto genérico. */
  lockedReason?: string | null;
  children?: React.ReactNode;
}) {
  const toneClasses: Record<string, string> = {
    ink: "bg-ink-800 text-paper",
    success: "bg-success text-paper",
    gold: "bg-gold-600 text-ink-950",
  };
  return (
    <section className="overflow-hidden rounded-lg border border-paper-border bg-paper">
      <div className={cn("flex items-center gap-2.5 px-5 py-3", toneClasses[tone])}>
        <Icon className="h-5 w-5 flex-none" aria-hidden="true" />
        <p className="text-sm font-semibold">{instruction}</p>
      </div>
      {children && <div className="p-5">{children}</div>}
      {lockedReason && (
        <div className="flex items-start gap-2 border-t border-paper-border bg-paper-muted px-5 py-3 text-sm text-ash-600">
          <Lock className="mt-0.5 h-4 w-4 flex-none text-ash-400" aria-hidden="true" />
          <p>
            <span className="font-medium text-ash-700">No disponible hasta que:</span> {lockedReason}
          </p>
        </div>
      )}
    </section>
  );
}

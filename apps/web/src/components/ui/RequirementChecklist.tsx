import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * "Por hacer: Recibir una calificación / de aprobado" — checklist visual
 * inspirado en la referencia (formaciondocente.upn.edu.pe), pero con el
 * detalle real de Inkademy: cada requisito trae su propio estado (`done`),
 * así que se ve de un vistazo qué ya se cumplió y qué falta, no solo una
 * lista genérica de pendientes (ver EnrollmentService.computeApprovalMissing
 * → approvalChecklist).
 */
export function RequirementChecklist({ items }: { items: { label: string; done: boolean }[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, i) => (
        <li key={i} className={cn("flex items-start gap-2 text-sm", item.done ? "text-ash-500" : "text-ink-800")}>
          {item.done ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-success" aria-hidden="true" />
          ) : (
            <Circle className="mt-0.5 h-4 w-4 flex-none text-ash-300" aria-hidden="true" />
          )}
          <span className={cn(item.done && "line-through decoration-ash-300")}>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

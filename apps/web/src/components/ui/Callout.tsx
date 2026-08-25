import { cva, type VariantProps } from "class-variance-authority";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { HTMLAttributes } from "react";

const calloutVariants = cva("flex gap-3 rounded-md border p-4 text-sm", {
  variants: {
    variant: {
      info: "border-ink-200 bg-ink-50 text-ink-800",
      success: "border-success/30 bg-success-bg text-success",
      warning: "border-warning/30 bg-warning-bg text-warning",
      danger: "border-danger/30 bg-danger-bg text-danger",
    },
  },
  defaultVariants: { variant: "info" },
});

const icons = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle };

export interface CalloutProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof calloutVariants> {
  title?: string;
}

export function Callout({ className, variant, title, children, ...props }: CalloutProps) {
  const Icon = icons[variant ?? "info"];
  // "danger" (y "warning", igual de urgente) necesita una región assertiva
  // (role="alert") para que un lector de pantalla avise DE INMEDIATO de que
  // algo falló — role="status" es "cortés" y puede anunciarse tarde o nunca
  // si el usuario está en medio de otra cosa. Antes se usaba "status" para
  // los cuatro variantes por igual, incluyendo errores de guardado/envío en
  // todos los formularios admin.
  const role = variant === "danger" || variant === "warning" ? "alert" : "status";
  return (
    <div role={role} className={cn(calloutVariants({ variant }), className)} {...props}>
      <Icon className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
      <div>
        {title && <p className="font-medium">{title}</p>}
        <div className="text-current/90">{children}</div>
      </div>
    </div>
  );
}

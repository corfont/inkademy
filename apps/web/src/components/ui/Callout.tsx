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
  return (
    <div role="status" className={cn(calloutVariants({ variant }), className)} {...props}>
      <Icon className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
      <div>
        {title && <p className="font-medium">{title}</p>}
        <div className="text-current/90">{children}</div>
      </div>
    </div>
  );
}

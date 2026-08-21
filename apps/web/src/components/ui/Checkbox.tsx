import { forwardRef, type InputHTMLAttributes } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, className, id, ...props },
  ref,
) {
  return (
    <label htmlFor={id} className={cn("flex cursor-pointer items-center gap-2 text-sm text-ash-700", className)}>
      <input ref={ref} type="checkbox" id={id} className="peer sr-only" {...props} />
      <span
        aria-hidden="true"
        className="flex h-5 w-5 flex-none items-center justify-center rounded-sm border border-paper-border bg-paper text-paper transition-colors peer-checked:border-ink-700 peer-checked:bg-ink-700 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ink-500"
      >
        <Check className="h-3.5 w-3.5" />
      </span>
      {label}
    </label>
  );
});

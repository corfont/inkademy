import { forwardRef, type InputHTMLAttributes, type LabelHTMLAttributes, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, error, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={!!error}
      className={cn(
        "h-11 w-full rounded-md border border-paper-border bg-paper px-3 text-sm text-ash-800 placeholder:text-ash-400",
        "focus-visible:outline-2 focus-visible:outline-ink-500",
        error && "border-danger",
        className,
      )}
      {...props}
    />
  );
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, error, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={!!error}
      className={cn(
        "min-h-[6rem] w-full rounded-md border border-paper-border bg-paper px-3 py-2 text-sm text-ash-800 placeholder:text-ash-400",
        "focus-visible:outline-2 focus-visible:outline-ink-500",
        error && "border-danger",
        className,
      )}
      {...props}
    />
  );
});

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("mb-1.5 block text-sm font-medium text-ash-700", className)} {...props} />;
}

export function FieldError({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p role="alert" className="mt-1 text-sm text-danger">
      {children}
    </p>
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, error, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      aria-invalid={!!error}
      className={cn(
        "h-11 w-full rounded-md border border-paper-border bg-paper px-3 text-sm text-ash-800",
        "focus-visible:outline-2 focus-visible:outline-ink-500",
        error && "border-danger",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});

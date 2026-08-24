import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2",
  {
    variants: {
      variant: {
        primary: "bg-ink-700 text-paper hover:bg-ink-800 shadow-sm",
        accent: "bg-gold-500 text-white hover:bg-gold-600 shadow-sm",
        // Segundo azul de marca de Inkapitales (#586BD8) — CTA secundario,
        // igual que en inkapitales.com.
        indigo: "bg-indigo-600 text-paper hover:bg-indigo-700 shadow-sm",
        outline: "border border-paper-border bg-transparent text-ink-700 hover:bg-paper-muted",
        ghost: "bg-transparent text-ink-700 hover:bg-paper-muted",
        subtle: "bg-paper-muted text-ash-800 hover:bg-ash-100",
        danger: "bg-danger text-white hover:opacity-90",
        link: "bg-transparent text-ink-600 underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-5 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, ...props },
  ref,
) {
  return <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});

"use client";

import { useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { Button } from "./Button";

export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(open, dialogRef, onClose, { initialFocus: "container" });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <div className="absolute inset-0 bg-ink-950/50 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "relative z-10 w-full max-w-lg animate-slide-up rounded-lg bg-paper p-6 shadow-raised",
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="font-serif text-xl font-semibold text-ink-900">
            {title}
          </h2>
          <Button variant="ghost" size="icon" aria-label="Cerrar" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

"use client";

import { useState, type ComponentProps } from "react";
import { Button } from "./Button";
import { ConfirmDialog } from "./ConfirmDialog";

/**
 * Botón que pide confirmación explícita (nombrando lo que se va a perder) antes de ejecutar una acción destructiva.
 * Una sola implementación para todo borrado de un clic — antes cada pantalla decidía si confirmar o no, y los borrados
 * de dinero (tarifas, adelantos, regalías, convenios) eran justo los que no lo hacían.
 */
export function ConfirmButton({
  children,
  title,
  message,
  confirmLabel = "Sí, eliminar",
  onConfirm,
  ...buttonProps
}: Omit<ComponentProps<typeof Button>, "onClick" | "title"> & {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" {...buttonProps} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <ConfirmDialog
        open={open}
        title={title}
        message={message}
        confirmLabel={confirmLabel}
        danger
        onClose={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          onConfirm();
        }}
      />
    </>
  );
}

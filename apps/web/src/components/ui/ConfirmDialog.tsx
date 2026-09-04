"use client";

import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";

/**
 * Wrapper delgado sobre Dialog para reemplazar `confirm()` nativo: mismo
 * cierre por Escape/foco atrapado que Dialog ya trae, pero con estilo
 * consistente con el resto del sistema de diseño. Ver el comentario en
 * components/admin/UsersManager.tsx (ResetPasswordDialog) sobre por qué se
 * dejó de usar prompt()/alert()/confirm() nativos.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirmar",
  danger = false,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} className="max-w-sm">
      <p className="text-sm text-ash-600">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button type="button" variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
          {busy ? "…" : confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

/**
 * Antes no había ninguna forma de comprar más cupos de un pool existente
 * desde el panel de empresa — el checkout ya soportaba seatPoolQty pero
 * nada lo usaba. Este botón arma el link a /checkout con courseId/programId
 * + companyId + seatPoolQty, reutilizando el flujo de pago real.
 */
export function BuyMoreSeatsButton({
  companyId,
  courseId,
  programId,
}: {
  companyId: string;
  courseId?: string | null;
  programId?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(10);

  if (!courseId && !programId) return null;

  if (!open) {
    return (
      <Button size="sm" variant="indigo" onClick={() => setOpen(true)}>
        Comprar más cupos
      </Button>
    );
  }

  function goToCheckout() {
    const params = new URLSearchParams();
    if (courseId) params.set("courseId", courseId);
    if (programId) params.set("programId", programId);
    params.set("companyId", companyId);
    params.set("seatPoolQty", String(Math.max(1, qty)));
    router.push(`/checkout?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        min={1}
        value={qty}
        onChange={(e) => setQty(Number(e.target.value))}
        className="h-9 w-20"
      />
      <Button size="sm" onClick={goToCheckout}>
        Ir a pagar
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
        Cancelar
      </Button>
    </div>
  );
}

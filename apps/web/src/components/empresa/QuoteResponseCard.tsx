"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { companyApi, ApiError } from "@/lib/api-client";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatPrice, formatDate } from "@/lib/format";

const STATUS_VARIANT: Record<string, "neutral" | "warning" | "success" | "danger"> = {
  REQUESTED: "warning",
  SENT: "neutral",
  ACCEPTED: "success",
  REJECTED: "danger",
};

/**
 * Antes esta fila solo mostraba el pedido y una etiqueta de estado, sin
 * ninguna forma de actuar cuando ventas ya respondió (pipeline comercial,
 * Fase 2) — la empresa no tenía cómo aceptar o rechazar una cotización
 * "SENT" desde acá, y tampoco veía el monto/vigencia que ventas fijó.
 */
export function QuoteResponseCard({
  quote,
  companyId,
  locale,
  requestedOnLabel,
}: {
  quote: {
    id: string;
    offeringDescription: string;
    status: "REQUESTED" | "SENT" | "ACCEPTED" | "REJECTED";
    amount?: number | null;
    currency?: string | null;
    validUntil?: string | null;
    seatsQuoted?: number | null;
  };
  companyId: string;
  locale: string;
  requestedOnLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function respond(status: "ACCEPTED" | "REJECTED") {
    if (status === "REJECTED" && !confirm("¿Rechazar esta cotización?")) return;
    setBusy(true);
    setError(null);
    try {
      await companyApi.updateQuoteStatus(companyId, quote.id, status);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar tu decisión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-paper-border bg-paper p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-medium text-ink-900">{quote.offeringDescription}</p>
          <p className="text-sm text-ash-500">{requestedOnLabel}</p>
        </div>
        <Badge variant={STATUS_VARIANT[quote.status]}>{quote.status}</Badge>
      </div>

      {quote.status !== "REQUESTED" && quote.amount != null && (
        <div className="rounded-md bg-paper-muted p-3 text-sm">
          <p className="font-serif text-lg font-semibold text-ink-900">{formatPrice(quote.amount, quote.currency ?? "PEN", locale)}</p>
          <p className="text-xs text-ash-500">
            {quote.seatsQuoted ? `${quote.seatsQuoted} cupos` : ""}
            {quote.validUntil ? ` · válida hasta ${formatDate(quote.validUntil, locale)}` : ""}
          </p>
        </div>
      )}

      {quote.status === "SENT" && (
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={busy} onClick={() => respond("ACCEPTED")}>
            Aceptar
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => respond("REJECTED")}>
            Rechazar
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

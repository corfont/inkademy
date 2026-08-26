"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, ApiError } from "@/lib/api-client";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

const STATUS_LABEL: Record<string, string> = {
  REQUESTED: "Pedida — falta responder",
  SENT: "Enviada — esperando que la empresa decida",
  ACCEPTED: "Aceptada",
  REJECTED: "Rechazada",
};
const STATUS_VARIANT: Record<string, "warning" | "neutral" | "success" | "danger"> = {
  REQUESTED: "warning",
  SENT: "neutral",
  ACCEPTED: "success",
  REJECTED: "danger",
};
const STATUS_ORDER = ["REQUESTED", "SENT", "ACCEPTED", "REJECTED"];

function money(amount: unknown, currency: unknown) {
  if (amount === null || amount === undefined) return "—";
  const symbol = currency === "USD" ? "US$" : "S/";
  return `${symbol} ${Number(amount).toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;
}

/**
 * "Facturación/cotización con pipeline comercial" (Fase 2) — antes un
 * Quote solo era el pedido inicial en texto libre, sin ningún panel para
 * que ventas le diera seguimiento, fijara un monto, o lo convirtiera en
 * algo real al aceptarse. Se agrupa por estado — mismo patrón que
 * /admin/sugerencias — para que de un vistazo se vea cuánto falta por
 * responder vs. cuánto ya está cerrado.
 */
export function QuotesPipelineManager({ quotes, courses, programs }: { quotes: any[]; courses: any[]; programs: any[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ocurrió un error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {error && <Callout variant="danger">{error}</Callout>}
      {quotes.length === 0 ? (
        <p className="text-sm text-ash-500">Todavía no hay ninguna cotización pedida.</p>
      ) : (
        STATUS_ORDER.map((status) => {
          const rows = quotes.filter((q) => q.status === status);
          if (rows.length === 0) return null;
          return (
            <div key={status}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ash-500">
                <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge> ({rows.length})
              </h2>
              <div className="flex flex-col gap-4">
                {rows.map((q) => (
                  <QuoteCard key={q.id} quote={q} courses={courses} programs={programs} busy={busy} run={run} />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function QuoteCard({ quote, courses, programs, busy, run }: { quote: any; courses: any[]; programs: any[]; busy: boolean; run: any }) {
  const [responding, setResponding] = useState(false);
  const [offeringKind, setOfferingKind] = useState<"COURSE" | "PROGRAM">("COURSE");
  const [offeringId, setOfferingId] = useState("");
  const [seatsQuoted, setSeatsQuoted] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"PEN" | "USD">("PEN");
  const [validUntil, setValidUntil] = useState("");
  const [salesOwner, setSalesOwner] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  return (
    <Card className="transition-shadow hover:shadow-raised">
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-serif font-semibold text-ink-900">{quote.company?.legalName ?? "Empresa"}</p>
            <p className="text-xs text-ash-500">RUC/Tax ID {quote.company?.taxId ?? "—"} · Pedida el {new Date(quote.createdAt).toLocaleDateString("es-PE")}</p>
          </div>
          {quote.amount != null && <p className="font-serif text-lg font-semibold text-ink-900">{money(quote.amount, quote.currency)}</p>}
        </div>

        <p className="whitespace-pre-wrap rounded-md bg-paper-muted p-3 text-sm text-ash-700">{quote.offeringDescription}</p>

        {(quote.courseTitle || quote.programTitle) && (
          <p className="text-xs text-ash-600">
            Oferta: {quote.courseTitle?.es ?? quote.programTitle?.es} {quote.seatsQuoted ? `· ${quote.seatsQuoted} cupos` : ""}
            {quote.validUntil ? ` · válida hasta ${new Date(quote.validUntil).toLocaleDateString("es-PE")}` : ""}
          </p>
        )}
        {quote.internalNotes && (
          <p className="text-xs text-ash-500">
            <span className="font-medium">Nota interna (no la ve la empresa):</span> {quote.internalNotes}
          </p>
        )}
        {quote.convertedSeatPoolId && <Badge variant="success">Ya convertida en cupos</Badge>}

        {quote.status === "REQUESTED" && !responding && (
          <Button size="sm" className="self-start" disabled={busy} onClick={() => setResponding(true)}>
            Responder con una cotización
          </Button>
        )}

        {quote.status === "REQUESTED" && responding && (
          <div className="flex flex-col gap-3 rounded-md border border-paper-border p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Tipo de oferta</Label>
                <Select value={offeringKind} onChange={(e) => { setOfferingKind(e.target.value as "COURSE" | "PROGRAM"); setOfferingId(""); }}>
                  <option value="COURSE">Curso</option>
                  <option value="PROGRAM">Programa</option>
                </Select>
              </div>
              <div>
                <Label>{offeringKind === "COURSE" ? "Curso" : "Programa"}</Label>
                <Select value={offeringId} onChange={(e) => setOfferingId(e.target.value)}>
                  <option value="">Elegir…</option>
                  {(offeringKind === "COURSE" ? courses : programs).map((o: any) => (
                    <option key={o.id} value={o.id}>
                      {o.title?.es ?? o.slug}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Cupos cotizados</Label>
                <Input type="number" min="1" value={seatsQuoted} onChange={(e) => setSeatsQuoted(e.target.value)} />
              </div>
              <div>
                <Label>Válida hasta</Label>
                <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </div>
              <div>
                <Label>Monto</Label>
                <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div>
                <Label>Moneda</Label>
                <Select value={currency} onChange={(e) => setCurrency(e.target.value as "PEN" | "USD")}>
                  <option value="PEN">Soles</option>
                  <option value="USD">Dólares</option>
                </Select>
              </div>
              <div>
                <Label>Responsable comercial</Label>
                <Input value={salesOwner} onChange={(e) => setSalesOwner(e.target.value)} placeholder="Nombre de quien lleva el caso" />
              </div>
            </div>
            <div>
              <Label>Notas internas (la empresa nunca las ve)</Label>
              <Textarea rows={2} value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={busy || !amount || !seatsQuoted || !offeringId}
                onClick={() =>
                  run(() =>
                    adminApi.respondToQuote(quote.id, {
                      offeringKind,
                      courseId: offeringKind === "COURSE" ? offeringId : undefined,
                      programId: offeringKind === "PROGRAM" ? offeringId : undefined,
                      seatsQuoted: Number(seatsQuoted),
                      amount: Number(amount),
                      currency,
                      validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
                      salesOwner: salesOwner || undefined,
                      internalNotes: internalNotes || undefined,
                    }),
                  )
                }
              >
                Enviar cotización
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setResponding(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        {quote.status === "ACCEPTED" && !quote.convertedSeatPoolId && (
          <Button size="sm" className="self-start" disabled={busy} onClick={() => run(() => adminApi.convertQuote(quote.id))}>
            Convertir en cupos B2B
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

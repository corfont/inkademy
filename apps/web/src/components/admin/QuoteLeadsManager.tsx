"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, ApiError } from "@/lib/api-client";
import { getClientAccessToken } from "@/lib/auth";
import { Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

type Lead = {
  id: string;
  legalName: string;
  taxId: string | null;
  contactName: string | null;
  contactEmail: string;
  contactPhone: string | null;
  seatsRange: string | null;
  interest: string | null;
  message: string;
  status: "NEW" | "CONTACTED" | "CLOSED";
  internalNotes: string | null;
  crmSyncedAt: string | null;
  crmSyncNote: string | null;
  createdAt: string;
};

const STATUS_LABEL = { NEW: "Nueva", CONTACTED: "Atendida", CLOSED: "Cerrada" } as const;
const STATUS_VARIANT = { NEW: "warning", CONTACTED: "neutral", CLOSED: "success" } as const;
const CRM_NOTE: Record<string, string> = {
  sin_configurar: "El CRM no está configurado en este servidor.",
  sin_ruc_valido: "No se envió al CRM: falta un RUC peruano de 11 dígitos.",
  crm_rechazo: "El CRM rechazó el contacto.",
  error_red: "No se pudo contactar al CRM.",
};

/** Solicitudes de cotización que llegan del formulario público de /empresas, antes de que la empresa tenga cuenta. */
export function QuoteLeadsManager({ leads }: { leads: Lead[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  async function update(id: string, input: { status?: Lead["status"]; internalNotes?: string | null }) {
    setBusy(id);
    setError(null);
    try {
      await adminApi.updateQuoteLead(id, input, getClientAccessToken());
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo guardar el cambio.");
    } finally {
      setBusy(null);
    }
  }

  const pending = leads.filter((l) => l.status === "NEW").length;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="font-serif text-xl font-semibold text-ink-900">Solicitudes del formulario público</h2>
        {pending > 0 && <Badge variant="warning">{pending} sin atender</Badge>}
      </div>
      {error && <Callout variant="danger">{error}</Callout>}
      {leads.length === 0 && <p className="text-sm text-ash-500">Todavía no llegaron solicitudes desde la página de empresas.</p>}
      {leads.map((l) => (
        <Card key={l.id}>
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-ink-900">{l.legalName}{l.taxId ? <span className="font-normal text-ash-500"> · {l.taxId}</span> : null}</p>
                <p className="text-sm text-ash-600">
                  {l.contactName ?? "—"} · <a className="underline" href={`mailto:${l.contactEmail}`}>{l.contactEmail}</a>{l.contactPhone ? ` · ${l.contactPhone}` : ""}
                </p>
                <p className="text-xs text-ash-500">
                  {new Date(l.createdAt).toLocaleString("es-PE")} · {l.seatsRange ?? "—"} personas · Interés: {l.interest || "—"}
                </p>
              </div>
              <Badge variant={STATUS_VARIANT[l.status]}>{STATUS_LABEL[l.status]}</Badge>
            </div>
            <p className="whitespace-pre-wrap text-sm text-ink-800">{l.message}</p>
            <p className="text-xs text-ash-500">
              {l.crmSyncedAt ? "Registrada como contacto en el CRM." : CRM_NOTE[l.crmSyncNote ?? ""] ?? "Pendiente de enviar al CRM."}
            </p>
            <Textarea
              aria-label="Notas internas"
              placeholder="Notas internas del equipo comercial (no las ve la empresa)"
              value={notes[l.id] ?? l.internalNotes ?? ""}
              onChange={(e) => setNotes((n) => ({ ...n, [l.id]: e.target.value }))}
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={busy === l.id} onClick={() => update(l.id, { internalNotes: notes[l.id] ?? l.internalNotes ?? "" })}>
                Guardar notas
              </Button>
              {l.status !== "CONTACTED" && (
                <Button size="sm" disabled={busy === l.id} onClick={() => update(l.id, { status: "CONTACTED" })}>Marcar atendida</Button>
              )}
              {l.status !== "CLOSED" && (
                <Button size="sm" variant="outline" disabled={busy === l.id} onClick={() => update(l.id, { status: "CLOSED" })}>Cerrar</Button>
              )}
              {l.status !== "NEW" && (
                <Button size="sm" variant="ghost" disabled={busy === l.id} onClick={() => update(l.id, { status: "NEW" })}>Reabrir</Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

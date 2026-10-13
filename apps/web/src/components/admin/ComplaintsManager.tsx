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

type Complaint = {
  id: string;
  folio: string;
  kind: "RECLAMO" | "QUEJA";
  fullName: string;
  docType: string;
  docNumber: string;
  email: string;
  phone: string;
  service: string;
  description: string;
  request: string;
  status: "PENDING" | "RESPONDED";
  dueAt: string;
  response: string | null;
  respondedAt: string | null;
  createdAt: string;
};

const UTC_DATE: Intl.DateTimeFormatOptions = { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" };

/** Reclamos y quejas del Libro de Reclamaciones: plazo legal visible y respuesta que se envía al consumidor por correo. */
export function ComplaintsManager({ complaints }: { complaints: Complaint[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function respond(c: Complaint) {
    setBusy(c.id);
    setError(null);
    setOk(null);
    try {
      await adminApi.respondComplaint(c.id, drafts[c.id] ?? "", getClientAccessToken());
      setOk(`Respuesta enviada a ${c.email} (${c.folio}).`);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo enviar la respuesta.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Callout variant="danger">{error}</Callout>}
      {ok && <Callout variant="success">{ok}</Callout>}
      {complaints.map((c) => {
        const overdue = c.status === "PENDING" && new Date(c.dueAt).getTime() < Date.now();
        return (
          <Card key={c.id}>
            <CardContent className="flex flex-col gap-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-ink-900">
                    <span className="font-mono">{c.folio}</span> · {c.kind === "QUEJA" ? "Queja" : "Reclamo"} · {c.service}
                  </p>
                  <p className="text-sm text-ash-600">
                    {c.fullName} · {c.docType} {c.docNumber} · <a className="underline" href={`mailto:${c.email}`}>{c.email}</a> · {c.phone}
                  </p>
                  <p className="text-xs text-ash-500">
                    Registrado el {new Date(c.createdAt).toLocaleDateString("es-PE", UTC_DATE)} · plazo de respuesta hasta el {new Date(c.dueAt).toLocaleDateString("es-PE", UTC_DATE)}
                  </p>
                </div>
                <Badge variant={c.status === "RESPONDED" ? "success" : overdue ? "danger" : "warning"}>
                  {c.status === "RESPONDED" ? "Respondido" : overdue ? "Plazo vencido" : "Pendiente"}
                </Badge>
              </div>
              <div className="text-sm text-ink-800">
                <p className="font-medium">Descripción</p>
                <p className="whitespace-pre-wrap">{c.description}</p>
                <p className="mt-2 font-medium">Pedido del consumidor</p>
                <p className="whitespace-pre-wrap">{c.request}</p>
              </div>
              {c.status === "RESPONDED" ? (
                <div className="rounded-md bg-paper-muted p-3 text-sm">
                  <p className="font-medium text-ink-900">Respuesta enviada el {c.respondedAt ? new Date(c.respondedAt).toLocaleDateString("es-PE", UTC_DATE) : "—"}</p>
                  <p className="whitespace-pre-wrap text-ink-800">{c.response}</p>
                </div>
              ) : (
                <>
                  <Textarea
                    aria-label={`Respuesta para ${c.folio}`}
                    placeholder="Escribe la respuesta formal al consumidor (se le envía por correo)"
                    rows={3}
                    value={drafts[c.id] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                  />
                  <div>
                    <Button size="sm" disabled={busy === c.id || (drafts[c.id] ?? "").trim().length < 10} onClick={() => respond(c)}>
                      Enviar respuesta
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

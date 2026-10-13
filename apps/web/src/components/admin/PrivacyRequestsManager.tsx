"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, privacyApi, type AdminPrivacyRequestDTO } from "@/lib/api-client";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Label, Textarea } from "@/components/ui/Input";

const TYPE_LABEL: Record<string, string> = { ACCESS: "Acceso", RECTIFICATION: "Rectificación", CANCELLATION: "Cancelación (eliminación)", OPPOSITION: "Oposición" };
const STATUS_LABEL: Record<string, string> = { PENDING: "En trámite", COMPLETED: "Atendida", REJECTED: "No procedió" };
const fmt = (iso: string) => new Date(iso).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" });

/**
 * Bandeja de solicitudes ARCO (Ley 29733). Las vencidas se marcan en rojo — el plazo es obligación legal. «Eliminar los datos de esta cuenta»
 * es irreversible y solo lo puede ejecutar un administrador completo: anonimiza la cuenta y conserva lo que la ley obliga a guardar.
 */
export function PrivacyRequestsManager({ requests }: { requests: AdminPrivacyRequestDTO[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
      setOpenId(null);
      setNote("");
      setConfirmId(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo completar la acción.");
      setConfirmId(null);
    } finally {
      setBusyId(null);
    }
  }

  const pending = requests.filter((r) => r.status === "PENDING");
  const now = Date.now();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ash-600">
        {pending.length === 0 ? "No hay solicitudes en trámite." : `${pending.length} solicitud(es) en trámite.`} Las atendidas quedan como constancia.
      </p>
      {error && <Callout variant="danger">{error}</Callout>}

      {requests.length === 0 ? (
        <p className="text-sm text-ash-500">Todavía no hay solicitudes de privacidad.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((r) => {
            const overdue = r.status === "PENDING" && new Date(r.dueAt).getTime() < now;
            const who = r.user ? `${r.user.firstName} ${r.user.lastName} (${r.user.email})` : r.requesterName ? `${r.requesterName}` : "Cuenta eliminada";
            return (
              <li key={r.id}>
                <Card>
                  <CardContent className="flex flex-col gap-2 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-ink-900">{TYPE_LABEL[r.type] ?? r.type}</span>
                      <Badge variant={r.status === "PENDING" ? "warning" : r.status === "COMPLETED" ? "success" : "danger"}>{STATUS_LABEL[r.status]}</Badge>
                      {overdue && <Badge variant="danger">Plazo vencido</Badge>}
                    </div>
                    <p className="text-xs text-ash-500">
                      {who} · recibida el {fmt(r.createdAt)}
                      {r.status === "PENDING" ? ` · responder antes del ${fmt(r.dueAt)}` : r.resolvedAt ? ` · resuelta el ${fmt(r.resolvedAt)}` : ""}
                    </p>
                    {r.message && <p className="whitespace-pre-line rounded-md bg-paper-muted p-2 text-sm text-ash-800">{r.message}</p>}
                    {r.resolutionNote && <p className="text-sm text-ash-700"><b>Respuesta:</b> {r.resolutionNote}</p>}

                    {r.status === "PENDING" && (
                      <div className="flex flex-col gap-2">
                        {openId === r.id ? (
                          <div className="flex flex-col gap-2">
                            <Label htmlFor={`note-${r.id}`}>Respuesta para la persona (se le envía por correo)</Label>
                            <Textarea id={`note-${r.id}`} rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
                            <div className="flex flex-wrap gap-2">
                              {r.type !== "CANCELLATION" && (
                                <Button size="sm" disabled={busyId === r.id || note.trim().length < 5} onClick={() => run(r.id, () => privacyApi.adminResolve(r.id, { outcome: "COMPLETED", note }))}>
                                  Marcar como atendida
                                </Button>
                              )}
                              <Button size="sm" variant="outline" disabled={busyId === r.id || note.trim().length < 5} onClick={() => run(r.id, () => privacyApi.adminResolve(r.id, { outcome: "REJECTED", note }))}>
                                No procede (explicar motivo)
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => { setOpenId(null); setNote(""); }}>Cancelar</Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => { setOpenId(r.id); setNote(""); }}>Responder</Button>
                            {r.type === "CANCELLATION" && r.user && (
                              <Button size="sm" variant="outline" className="text-danger" disabled={busyId === r.id} onClick={() => setConfirmId(r.id)}>
                                Eliminar los datos de esta cuenta
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={confirmId !== null}
        title="¿Eliminar los datos de esta cuenta?"
        message="Es irreversible: se borran o anonimizan los datos personales y se cierra la cuenta. Se conservan los comprobantes de pago y los certificados ya emitidos (obligación legal). Se le avisa a la persona por correo."
        confirmLabel="Sí, eliminar los datos"
        danger
        busy={busyId !== null}
        onConfirm={() => confirmId && run(confirmId, () => privacyApi.adminExecuteCancellation(confirmId))}
        onClose={() => setConfirmId(null)}
      />
    </div>
  );
}

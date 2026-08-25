"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, BookMarked, Check } from "lucide-react";
import { supportApi, ApiError } from "@/lib/api-client";
import { Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

const PRIORITY_VARIANT: Record<string, "danger" | "warning" | "neutral"> = {
  URGENT: "danger",
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Abierto",
  IN_PROGRESS: "En progreso",
  WAITING_USER: "Esperando tu respuesta",
  RESOLVED: "Resuelto",
  CLOSED: "Cerrado",
};

function isStaff(author: { globalRole?: string }) {
  return author?.globalRole === "ADMIN" || author?.globalRole === "SUPPORT";
}

function authorName(author: any) {
  return (
    author?.displayName ||
    [author?.firstName, author?.lastName].filter(Boolean).join(" ") ||
    author?.email ||
    "Usuario"
  );
}

/**
 * Hilo de un ticket + caja de respuesta. Usado tanto en /campus/soporte/:id
 * (el alumno que abrió el ticket) como en /admin/soporte/:id (soporte/admin
 * respondiendo) — la única diferencia entre ambos contextos es de permisos,
 * que ya resuelve el backend (SupportService.getTicket/addMessage).
 *
 * `isStaffView` habilita, solo para soporte/admin, el borrador de respuesta
 * con IA y "guardar como fuente para la IA" — ninguno de los dos tiene
 * sentido para el alumno que abrió el ticket.
 */
export function TicketThread({ ticket, backHref, isStaffView = false }: { ticket: any; backHref: string; isStaffView?: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReply() {
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    try {
      await supportApi.addMessage(ticket.id, body.trim());
      setBody("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos enviar tu respuesta.");
    } finally {
      setSending(false);
    }
  }

  async function handleDraft() {
    setDrafting(true);
    setError(null);
    try {
      const { draft } = await supportApi.suggestReply(ticket.id);
      setBody(draft);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos generar un borrador.");
    } finally {
      setDrafting(false);
    }
  }

  async function handleSaveAsKnowledge() {
    setSaving(true);
    setError(null);
    try {
      await supportApi.saveAsKnowledge(ticket.id);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar este ticket como fuente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <a href={backHref} className="text-sm text-ink-700 hover:underline">
          ← Volver a tickets
        </a>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-serif text-2xl font-semibold text-ink-900">{ticket.subject}</h1>
          <div className="flex gap-2">
            <Badge variant={PRIORITY_VARIANT[ticket.priority] ?? "neutral"}>{ticket.priority}</Badge>
            <Badge variant="outline">{STATUS_LABEL[ticket.status] ?? ticket.status}</Badge>
          </div>
        </div>
        <p className="text-sm text-ash-500">Categoría: {ticket.category}</p>
        {isStaffView && (
          <div className="mt-2">
            <Button size="sm" variant="outline" disabled={saving || saved} onClick={handleSaveAsKnowledge}>
              {saved ? (
                <>
                  <Check className="h-4 w-4" aria-hidden="true" /> Guardado como fuente de la IA
                </>
              ) : (
                <>
                  <BookMarked className="h-4 w-4" aria-hidden="true" /> {saving ? "Guardando…" : "Guardar como fuente para la IA"}
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {ticket.messages.map((msg: any) => {
          const staff = isStaff(msg.author);
          return (
            <Card key={msg.id} className={cn(staff && "border-ink-200 bg-ink-50")}>
              <CardContent className="p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink-900">
                    {authorName(msg.author)} {staff && <Badge variant="ink">Soporte</Badge>}
                  </p>
                  <p className="text-xs text-ash-500">{new Date(msg.createdAt).toLocaleString("es-PE")}</p>
                </div>
                <p className="whitespace-pre-wrap text-sm text-ash-700">{msg.body}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {error && <Callout variant="danger">{error}</Callout>}

      {ticket.status !== "CLOSED" && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4">
            <Textarea
              placeholder="Escribe tu respuesta…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-[6rem]"
            />
            <div className="flex flex-wrap gap-2">
              <Button disabled={sending || !body.trim()} onClick={handleReply} className="self-start">
                {sending ? "Enviando…" : "Responder"}
              </Button>
              {isStaffView && (
                <Button variant="outline" disabled={drafting} onClick={handleDraft} className="self-start">
                  <Sparkles className="h-4 w-4" aria-hidden="true" /> {drafting ? "Redactando…" : "Sugerir respuesta con IA"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

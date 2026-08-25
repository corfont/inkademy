"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, BookMarked, Check, Mail } from "lucide-react";
import { suggestionsApi, ApiError } from "@/lib/api-client";
import { Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { formatDateTime } from "@/lib/format";

/**
 * Panel de respuesta de una sugerencia: antes lo único que existía era
 * cambiarle el estado interno (NEW/REVIEWED/PLANNED/DECLINED) — quien mandó
 * la sugerencia nunca se enteraba de nada. Ahora el admin puede pedirle a
 * la IA un borrador, editarlo, enviarlo por correo, y guardar la sugerencia
 * ya respondida como fuente del asistente (para que una duda parecida en el
 * futuro se responda igual de bien).
 */
export function SuggestionReplyPanel({
  id,
  adminResponse,
  respondedAt,
  locale,
}: {
  id: string;
  adminResponse: string | null;
  respondedAt: string | null;
  locale: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(adminResponse ?? "");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);

  const hasResponse = Boolean(adminResponse) || justSent;

  async function handleDraft() {
    setDrafting(true);
    setError(null);
    try {
      const { draft } = await suggestionsApi.suggestReply(id);
      setBody(draft);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos generar un borrador.");
    } finally {
      setDrafting(false);
    }
  }

  async function handleSend() {
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    try {
      await suggestionsApi.respond(id, body.trim());
      setJustSent(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos enviar la respuesta.");
    } finally {
      setSending(false);
    }
  }

  async function handleSaveAsKnowledge() {
    setSaving(true);
    setError(null);
    try {
      await suggestionsApi.saveAsKnowledge(id);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar esto como fuente.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Mail className="h-4 w-4" aria-hidden="true" /> {hasResponse ? "Ver respuesta" : "Responder"}
        </Button>
        {hasResponse && respondedAt && <span className="text-xs text-ash-500">Respondida {formatDateTime(respondedAt, locale)}</span>}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-md border border-paper-border bg-paper-muted p-3">
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escribe la respuesta…" className="min-h-[5rem] text-sm" />
      {error && <Callout variant="danger">{error}</Callout>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={sending || !body.trim()} onClick={handleSend}>
          {sending ? "Enviando…" : "Enviar por correo"}
        </Button>
        <Button size="sm" variant="outline" disabled={drafting} onClick={handleDraft}>
          <Sparkles className="h-4 w-4" aria-hidden="true" /> {drafting ? "Redactando…" : "Sugerir con IA"}
        </Button>
        <Button size="sm" variant="outline" disabled={!hasResponse || saving || saved} onClick={handleSaveAsKnowledge}>
          {saved ? (
            <>
              <Check className="h-4 w-4" aria-hidden="true" /> Guardado
            </>
          ) : (
            <>
              <BookMarked className="h-4 w-4" aria-hidden="true" /> {saving ? "Guardando…" : "Guardar como fuente para la IA"}
            </>
          )}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cerrar
        </Button>
      </div>
    </div>
  );
}

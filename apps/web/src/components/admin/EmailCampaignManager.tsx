"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, ApiError, type EmailCampaignDTO, type MailingListDTO } from "@/lib/api-client";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";
import { AudienceFilterFields, filterToFormState, formStateToFilter, type AudienceFilterFormState } from "@/components/admin/AudienceFilterFields";

const GOAL_LABEL: Record<string, string> = {
  RELATED_COURSES: "Cursos relacionados a lo que ya estudia",
  NEW_COURSES: "Cursos nuevos del catálogo",
  DISCOUNTED_COURSES: "Cursos con descuento",
  BY_INTEREST: "Según su área de interés",
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "outline" | "danger"> = {
  DRAFT: "outline",
  SCHEDULED: "warning",
  SENT: "success",
  CANCELLED: "danger",
};

const STATUS_LABEL: Record<string, string> = { DRAFT: "Borrador", SCHEDULED: "Programada", SENT: "Enviada", CANCELLED: "Cancelada" };

/**
 * "Un módulo donde enviar correos a nuestros clientes... programado
 * automático con IA (redactando sobre cursos relacionados, nuevos, con
 * descuento, o por área de interés), o que uno redacte y parametrice para
 * mandar correos masivos." El envío real (y el borrador con IA) lo hace un
 * sweep de apps/worker cada 2 minutos — "enviar ahora" solo adelanta la
 * fecha programada a ahora mismo, ver AdminService.sendEmailCampaignNow.
 */
export function EmailCampaignManager({
  campaigns,
  areas,
  companies,
  courses,
  mailingLists,
}: {
  campaigns: EmailCampaignDTO[];
  areas: any[];
  companies: any[];
  courses: any[];
  mailingLists: MailingListDTO[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ocurrió un error.");
    } finally {
      setBusy(false);
    }
  }

  const [editingId, setEditingId] = useState<string | null>(null);
  const drafts = campaigns.filter((c) => c.status === "DRAFT" || c.status === "SCHEDULED");
  const history = campaigns.filter((c) => c.status === "SENT" || c.status === "CANCELLED");
  const editingCampaign = drafts.find((c) => c.id === editingId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      {error && <Callout variant="danger">{error}</Callout>}

      {editingCampaign ? (
        <CampaignForm
          key={editingCampaign.id}
          areas={areas}
          companies={companies}
          courses={courses}
          mailingLists={mailingLists}
          busy={busy}
          run={run}
          initial={editingCampaign}
          onDone={() => setEditingId(null)}
        />
      ) : (
        <CampaignForm areas={areas} companies={companies} courses={courses} mailingLists={mailingLists} busy={busy} run={run} />
      )}

      {drafts.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Borradores y programadas</h2>
          {drafts.map((c) => (
            <CampaignCard key={c.id} campaign={c} busy={busy} run={run} onEdit={() => setEditingId(c.id)} editing={c.id === editingId} />
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Historial</h2>
          {history.map((c) => <CampaignCard key={c.id} campaign={c} busy={busy} run={run} readOnly />)}
        </div>
      )}

      {campaigns.length === 0 && <p className="text-sm text-ash-500">Todavía no hay ninguna campaña creada.</p>}
    </div>
  );
}

function CampaignCard({
  campaign: c,
  busy,
  run,
  readOnly,
  onEdit,
  editing,
}: {
  campaign: EmailCampaignDTO;
  busy: boolean;
  run: (a: () => Promise<unknown>) => Promise<void>;
  readOnly?: boolean;
  onEdit?: () => void;
  editing?: boolean;
}) {
  return (
    <Card className={editing ? "border-ink-400" : undefined}>
      <CardContent className="flex flex-col gap-2 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-medium text-ink-900">{c.name}</h3>
            <p className="text-xs text-ash-500">
              {c.mode === "MANUAL" ? "Manual" : `Automática con IA — ${GOAL_LABEL[c.goal ?? ""] ?? c.goal}`}
              {c.recurrence !== "ONCE" && ` · repite ${c.recurrence === "WEEKLY" ? "cada semana" : "cada mes"}`}
            </p>
          </div>
          <Badge variant={STATUS_VARIANT[c.status]}>{STATUS_LABEL[c.status]}</Badge>
        </div>
        <p className="text-xs text-ash-500">
          {c.status === "SENT" && c.sentAt && `Enviada el ${new Date(c.sentAt).toLocaleString("es-PE")} a ${c.recipientCount} destinatario(s).`}
          {c.status === "SCHEDULED" && c.scheduledAt && `Programada para ${new Date(c.scheduledAt).toLocaleString("es-PE")}.`}
          {c.status === "DRAFT" && "Sin fecha de envío — sigue en borrador."}
        </p>
        {!readOnly && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" disabled={busy} onClick={onEdit}>
              {editing ? "Editando…" : "Editar"}
            </Button>
            <Button size="sm" disabled={busy} onClick={() => run(() => adminApi.sendEmailCampaignNow(c.id))}>
              Enviar ahora
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-danger hover:bg-danger-bg"
              disabled={busy}
              onClick={() => confirm(`¿Eliminar la campaña "${c.name}"?`) && run(() => adminApi.deleteEmailCampaign(c.id))}
            >
              Eliminar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Convierte a datetime-local (input HTML) el ISO que guarda el backend, en hora local del navegador. */
function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Crea una campaña nueva, o edita una existente (todavía DRAFT/SCHEDULED —
 * "no hay ninguna forma de arreglar un error de tipeo sin borrar y rehacer
 * la campaña entera" era el hueco real: adminApi.updateEmailCampaign ya
 * existía en el backend, pero nada en esta pantalla lo llamaba nunca).
 * `mode`/`goal` no se pueden cambiar después de creada (el backend tampoco
 * los acepta en el PATCH) — se muestran de solo lectura al editar.
 */
function CampaignForm({
  areas,
  companies,
  courses,
  mailingLists,
  busy,
  run,
  initial,
  onDone,
}: {
  areas: any[];
  companies: any[];
  courses: any[];
  mailingLists: MailingListDTO[];
  busy: boolean;
  run: (a: () => Promise<unknown>) => Promise<void>;
  initial?: EmailCampaignDTO;
  onDone?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [mode, setMode] = useState<"MANUAL" | "AUTOMATIC_AI">(initial?.mode ?? "MANUAL");
  const [goal, setGoal] = useState<string>(initial?.goal ?? "NEW_COURSES");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [bodyHtml, setBodyHtml] = useState(initial?.bodyHtml ?? "");
  const [audience, setAudience] = useState<AudienceFilterFormState>(filterToFormState(initial?.audienceFilter as never));
  const [loadListId, setLoadListId] = useState("");
  const [scheduledAt, setScheduledAt] = useState(toDatetimeLocal(initial?.scheduledAt ?? null));
  const [recurrence, setRecurrence] = useState<"ONCE" | "WEEKLY" | "MONTHLY">(initial?.recurrence ?? "ONCE");
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  // Copia puntual del filtro guardado hacia el formulario de la campaña —
  // no es un vínculo vivo: editar o borrar la lista después nunca afecta
  // retroactivamente una campaña que ya cargó su filtro una vez.
  function handleLoadList(id: string) {
    setLoadListId(id);
    const list = mailingLists.find((l) => l.id === id);
    if (list) setAudience(filterToFormState(list.filter));
  }

  async function handlePreview() {
    setPreviewBusy(true);
    try {
      const { count } = await adminApi.previewEmailAudience(formStateToFilter(audience) ?? {});
      setPreviewCount(count);
    } catch {
      setPreviewCount(null);
    } finally {
      setPreviewBusy(false);
    }
  }

  async function handleCreate(sendNow: boolean) {
    await run(async () => {
      const created = await adminApi.createEmailCampaign({
        name,
        mode,
        goal: mode === "AUTOMATIC_AI" ? goal : undefined,
        subject: mode === "MANUAL" ? subject : undefined,
        bodyHtml: mode === "MANUAL" ? bodyHtml : undefined,
        audienceFilter: formStateToFilter(audience),
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : sendNow ? new Date().toISOString() : null,
        recurrence,
      });
      if (sendNow && !scheduledAt) await adminApi.sendEmailCampaignNow(created.id);
    });
    setName("");
    setSubject("");
    setBodyHtml("");
    setAudience(filterToFormState(null));
    setLoadListId("");
    setScheduledAt("");
    setPreviewCount(null);
  }

  async function handleSaveEdit() {
    if (!initial) return;
    await run(() =>
      adminApi.updateEmailCampaign(initial.id, {
        name,
        subject: mode === "MANUAL" ? subject : undefined,
        bodyHtml: mode === "MANUAL" ? bodyHtml : undefined,
        audienceFilter: formStateToFilter(audience),
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        recurrence,
      }),
    );
    onDone?.();
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <h2 className="font-serif text-lg font-semibold text-ink-900">{initial ? `Editando "${initial.name}"` : "Nueva campaña"}</h2>

        <div>
          <Label htmlFor="camp-name">Nombre interno</Label>
          <Input id="camp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Descuentos de julio" />
        </div>

        {initial ? (
          // El modo (manual vs. IA) no se puede cambiar después de creada
          // (el backend tampoco lo acepta en el PATCH) — solo se muestra.
          <p className="text-xs text-ash-500">
            {mode === "MANUAL" ? "Manual (yo redacto)" : "Automática con IA"} — no se puede cambiar una vez creada.
          </p>
        ) : (
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={mode === "MANUAL"} onChange={() => setMode("MANUAL")} /> Manual (yo redacto)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={mode === "AUTOMATIC_AI"} onChange={() => setMode("AUTOMATIC_AI")} /> Automática con IA
            </label>
          </div>
        )}

        {mode === "MANUAL" ? (
          <div className="flex flex-col gap-3">
            <div>
              <Label htmlFor="camp-subject">Asunto</Label>
              <Input id="camp-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="camp-body">Contenido (HTML)</Label>
              <Textarea id="camp-body" rows={6} value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} placeholder="<p>Hola…</p>" />
            </div>
          </div>
        ) : (
          <div>
            <Label htmlFor="camp-goal">La IA debe redactar sobre…</Label>
            <Select id="camp-goal" value={goal} disabled={Boolean(initial)} onChange={(e) => setGoal(e.target.value)}>
              {Object.entries(GOAL_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-ash-500">
              {initial
                ? "El objetivo tampoco se puede cambiar una vez creada."
                : "Requiere el asistente de IA activado en /admin/asistente-ia. Si el destinatario tiene varios intereses distintos entre sí, se agrupan por interés principal para redactar un correo por grupo (no 100% personalizado por persona)."}
            </p>
          </div>
        )}

        <div className="rounded-md bg-paper-muted p-3">
          <p className="mb-2 text-xs font-medium text-ash-600">Audiencia (deja todo vacío para "todos los que aceptaron correos de marketing")</p>
          {mailingLists.length > 0 && (
            <div className="mb-3">
              <Label htmlFor="camp-load-list">Cargar desde lista guardada</Label>
              <Select id="camp-load-list" value={loadListId} onChange={(e) => handleLoadList(e.target.value)}>
                <option value="">— Armar a mano —</option>
                {mailingLists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-ash-500">Copia el filtro de la lista a este formulario — se puede seguir ajustando sin afectar la lista original.</p>
            </div>
          )}
          <AudienceFilterFields value={audience} onChange={setAudience} areas={areas} companies={companies} courses={courses} idPrefix="camp" />
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={previewBusy} onClick={handlePreview}>
              {previewBusy ? "Calculando…" : "Ver a cuántos llega"}
            </Button>
            {previewCount !== null && <span className="text-xs text-ash-600">{previewCount} destinatario(s)</span>}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="camp-schedule">Programar para (opcional — vacío = borrador)</Label>
            <Input id="camp-schedule" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="camp-recurrence">Repetir</Label>
            <Select id="camp-recurrence" value={recurrence} onChange={(e) => setRecurrence(e.target.value as never)}>
              <option value="ONCE">Una sola vez</option>
              <option value="WEEKLY">Cada semana</option>
              <option value="MONTHLY">Cada mes</option>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {initial ? (
            <>
              <Button disabled={busy || !name.trim()} onClick={handleSaveEdit}>
                Guardar cambios
              </Button>
              <Button variant="ghost" disabled={busy} onClick={onDone}>
                Cancelar
              </Button>
            </>
          ) : (
            <>
              <Button disabled={busy || !name.trim()} onClick={() => handleCreate(false)}>
                {scheduledAt ? "Programar" : "Guardar como borrador"}
              </Button>
              <Button variant="outline" disabled={busy || !name.trim()} onClick={() => handleCreate(true)}>
                Enviar ahora
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

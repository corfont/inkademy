"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, ApiError, type MailingListDTO } from "@/lib/api-client";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";
import {
  AudienceFilterFields,
  filterToFormState,
  formStateToFilter,
  EMPTY_AUDIENCE_FILTER_FORM_STATE,
  type AudienceFilterFormState,
} from "@/components/admin/AudienceFilterFields";

/**
 * "También debería de poderse crear listas de correo... y poderlas
 * reutilizar, actualizar, borrar" — antes cada campaña armaba su audiencia
 * desde cero; una lista guardada acá se puede cargar (copia puntual, no un
 * vínculo vivo) desde el formulario de una campaña en `EmailCampaignManager`.
 */
export function MailingListManager({
  lists,
  areas,
  companies,
  courses,
}: {
  lists: MailingListDTO[];
  areas: any[];
  companies: any[];
  courses: any[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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

  const editingList = lists.find((l) => l.id === editingId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-lg font-semibold text-ink-900">Listas de correo guardadas</h2>
        {!creating && !editingList && (
          <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
            Nueva lista
          </Button>
        )}
      </div>

      {error && <Callout variant="danger">{error}</Callout>}

      {(creating || editingList) && (
        <MailingListForm
          key={editingList?.id ?? "new"}
          areas={areas}
          companies={companies}
          courses={courses}
          busy={busy}
          run={run}
          initial={editingList}
          onDone={() => {
            setCreating(false);
            setEditingId(null);
          }}
        />
      )}

      {lists.length === 0 ? (
        <p className="text-sm text-ash-500">Todavía no hay ninguna lista guardada.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {lists.map((l) => (
            <Card key={l.id} className={l.id === editingId ? "border-ink-400" : undefined}>
              <CardContent className="flex flex-wrap items-start justify-between gap-2 p-4">
                <div>
                  <h3 className="font-medium text-ink-900">{l.name}</h3>
                  {l.description && <p className="text-xs text-ash-500">{l.description}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setCreating(false);
                      setEditingId(l.id);
                    }}
                  >
                    {l.id === editingId ? "Editando…" : "Editar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger hover:bg-danger-bg"
                    disabled={busy}
                    onClick={() => confirm(`¿Eliminar la lista "${l.name}"?`) && run(() => adminApi.deleteMailingList(l.id))}
                  >
                    Eliminar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function MailingListForm({
  areas,
  companies,
  courses,
  busy,
  run,
  initial,
  onDone,
}: {
  areas: any[];
  companies: any[];
  courses: any[];
  busy: boolean;
  run: (a: () => Promise<unknown>) => Promise<void>;
  initial?: MailingListDTO | null;
  onDone: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [audience, setAudience] = useState<AudienceFilterFormState>(
    initial ? filterToFormState(initial.filter) : EMPTY_AUDIENCE_FILTER_FORM_STATE,
  );
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

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

  async function handleSave() {
    const payload = { name, description: description || null, filter: formStateToFilter(audience) };
    await run(() => (initial ? adminApi.updateMailingList(initial.id, payload) : adminApi.createMailingList(payload)));
    onDone();
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <h2 className="font-serif text-lg font-semibold text-ink-900">{initial ? `Editando "${initial.name}"` : "Nueva lista"}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="ml-name">Nombre</Label>
            <Input id="ml-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Interesados en finanzas" />
          </div>
          <div>
            <Label htmlFor="ml-description">Descripción (opcional)</Label>
            <Input id="ml-description" value={description ?? ""} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>

        <div className="rounded-md bg-paper-muted p-3">
          <AudienceFilterFields value={audience} onChange={setAudience} areas={areas} companies={companies} courses={courses} idPrefix="ml" />
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={previewBusy} onClick={handlePreview}>
              {previewBusy ? "Calculando…" : "Ver a cuántos llega"}
            </Button>
            {previewCount !== null && <span className="text-xs text-ash-600">{previewCount} destinatario(s)</span>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || !name.trim()} onClick={handleSave}>
            {initial ? "Guardar cambios" : "Crear lista"}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onDone}>
            Cancelar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

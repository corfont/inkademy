"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, ApiError } from "@/lib/api-client";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

/**
 * Antes GET/POST/PATCH /admin/areas existían en el API pero ninguna pantalla
 * los llamaba — un área nueva solo se podía crear insertándola directo en
 * la base de datos.
 */
export function AreaManager({ areas }: { areas: any[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ slug: "", nameEs: "", icon: "" });

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ocurrió un error. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    await run(() => adminApi.createArea({ slug: form.slug, name: { es: form.nameEs }, icon: form.icon || undefined, order: areas.length }));
    setForm({ slug: "", nameEs: "", icon: "" });
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <Callout variant="danger">{error}</Callout>}

      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 font-serif text-lg font-semibold text-ink-900">Áreas existentes</h2>
          {areas.length === 0 ? (
            <p className="text-sm text-ash-500">Todavía no hay áreas.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-paper-border">
              {areas.map((area) => (
                <AreaRow key={area.id} area={area} busy={busy} run={run} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Nueva área</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="area-name">Nombre</Label>
              <Input id="area-name" value={form.nameEs} onChange={(e) => setForm((f) => ({ ...f, nameEs: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="area-slug">Slug</Label>
              <Input id="area-slug" placeholder="gestion" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="area-icon">Ícono (opcional)</Label>
              <Input id="area-icon" placeholder="briefcase" value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} />
            </div>
          </div>
          <div>
            <Button disabled={busy || !form.slug.trim() || !form.nameEs.trim()} onClick={handleCreate}>
              Crear área
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AreaRow({ area, busy, run }: { area: any; busy: boolean; run: (a: () => Promise<unknown>) => void }) {
  const [nameEs, setNameEs] = useState(area.name?.es ?? "");
  const [editing, setEditing] = useState(false);

  return (
    <li className="flex items-center justify-between gap-3 py-3">
      {editing ? (
        <Input value={nameEs} onChange={(e) => setNameEs(e.target.value)} className="max-w-xs" />
      ) : (
        <div>
          <p className="font-medium text-ink-900">{area.name?.es}</p>
          <p className="text-xs text-ash-500">/{area.slug}</p>
        </div>
      )}
      <div className="flex gap-2">
        {editing ? (
          <>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                run(() => adminApi.updateArea(area.id, { name: { ...area.name, es: nameEs } }));
                setEditing(false);
              }}
            >
              Guardar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Editar
          </Button>
        )}
      </div>
    </li>
  );
}

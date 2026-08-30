"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Callout } from "@/components/ui/Callout";
import { Dialog } from "@/components/ui/Dialog";
import type { BulkDeleteResult } from "@/lib/api-client";

export interface BulkDeleteItem {
  id: string;
  label: string;
}

interface BulkDeleteSectionProps {
  title: string;
  /** Cómo se llama la entidad en la frase de confirmación, p.ej. "CURSO"/"CURSOS". */
  entityLabelSingular: string;
  entityLabelPlural: string;
  items: BulkDeleteItem[];
  loading?: boolean;
  onConfirm: (ids: string[]) => Promise<BulkDeleteResult>;
}

/**
 * "Los accesos a borrar todo... deberían tener una doble verificación o
 * escribir un código que muestre en la pantalla" — el admin debe tipear
 * letra por letra una frase que incluye la cantidad EXACTA seleccionada
 * (cambia si cambia la selección, así que no se puede memorizar de una vez
 * anterior). El backend es quien de verdad decide qué se puede borrar — acá
 * solo se muestra el resultado (borrados vs. omitidos con motivo) después
 * de intentarlo, nunca se promete de antemano que algo se podrá borrar.
 */
export function BulkDeleteSection({ title, entityLabelSingular, entityLabelPlural, items, loading, onConfirm }: BulkDeleteSectionProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BulkDeleteResult | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.label.toLowerCase().includes(q));
  }, [items, search]);

  const selectedCount = selected.size;
  const requiredPhrase = `ELIMINAR ${selectedCount} ${selectedCount === 1 ? entityLabelSingular : entityLabelPlural}`;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      filtered.forEach((i) => next.add(i.id));
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function handleConfirm() {
    setSubmitting(true);
    try {
      const res = await onConfirm(Array.from(selected));
      setResult(res);
      setSelected((prev) => {
        const next = new Set(prev);
        res.deleted.forEach((id) => next.delete(id));
        return next;
      });
      setDialogOpen(false);
      setConfirmText("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder="Buscar..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={`Buscar ${title.toLowerCase()}`}
        />
        <div className="flex items-center justify-between text-xs text-ash-500">
          <span>
            {filtered.length} de {items.length}
            {selectedCount > 0 ? ` · ${selectedCount} seleccionado(s)` : ""}
          </span>
          <div className="flex gap-3">
            <button type="button" className="underline hover:text-ink-700" onClick={selectAllFiltered}>
              Seleccionar todos
            </button>
            {selectedCount > 0 && (
              <button type="button" className="underline hover:text-ink-700" onClick={clearSelection}>
                Limpiar selección
              </button>
            )}
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto rounded-md border border-paper-border">
          {loading ? (
            <p className="p-4 text-sm text-ash-500">Cargando…</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-sm text-ash-500">Sin resultados.</p>
          ) : (
            <ul className="divide-y divide-paper-border">
              {filtered.map((item) => (
                <li key={item.id} className="px-3 py-2">
                  <Checkbox
                    id={`bulk-${item.id}`}
                    label={item.label}
                    checked={selected.has(item.id)}
                    onChange={() => toggle(item.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
        {result && (
          <div className="space-y-2 rounded-md border border-paper-border bg-paper-muted p-3 text-sm">
            <p className="font-medium text-ink-800">Eliminados: {result.deleted.length}</p>
            {result.skipped.length > 0 && (
              <div>
                <p className="mb-1 text-ash-600">Omitidos ({result.skipped.length}):</p>
                <ul className="list-inside list-disc space-y-0.5 text-ash-500">
                  {result.skipped.map((s) => (
                    <li key={s.id}>{items.find((i) => i.id === s.id)?.label ?? s.id} — {s.reason}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button variant="danger" disabled={selectedCount === 0} onClick={() => setDialogOpen(true)}>
          Eliminar seleccionados ({selectedCount})
        </Button>
      </CardFooter>

      <Dialog open={dialogOpen} onClose={() => !submitting && setDialogOpen(false)} title={`Eliminar ${selectedCount} ${title.toLowerCase()}`}>
        <div className="space-y-4">
          <Callout variant="danger" title="Esta acción no se puede deshacer">
            Solo se eliminarán los elementos que no tengan actividad real — el resto se omitirá y se te dirá por qué.
          </Callout>
          <p className="text-sm text-ash-700">
            Para confirmar, escribe exactamente: <span className="font-mono font-semibold text-ink-900">{requiredPhrase}</span>
          </p>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={requiredPhrase}
            autoFocus
          />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button variant="danger" disabled={confirmText !== requiredPhrase || submitting} onClick={handleConfirm}>
              {submitting ? "Eliminando…" : "Confirmar eliminación"}
            </Button>
          </div>
        </div>
      </Dialog>
    </Card>
  );
}

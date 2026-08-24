"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, ApiError } from "@/lib/api-client";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

/**
 * Antes GET/POST/PATCH /admin/programs existían en el API pero no había
 * ninguna pantalla para armar un programa/diplomado a partir de cursos ya
 * publicados — solo se podía crear directo en la base de datos.
 */
export function ProgramManager({ programs, courses }: { programs: any[]; courses: any[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ titleEs: "", slug: "", priceAmount: "0", priceCurrency: "PEN" });
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);

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
    await run(() =>
      adminApi.createProgram({
        slug: form.slug,
        title: { es: form.titleEs },
        priceAmount: Number(form.priceAmount),
        priceCurrency: form.priceCurrency,
        courseIds: selectedCourseIds,
        status: "DRAFT",
      }),
    );
    setForm({ titleEs: "", slug: "", priceAmount: "0", priceCurrency: "PEN" });
    setSelectedCourseIds([]);
  }

  function toggleCourse(id: string) {
    setSelectedCourseIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <Callout variant="danger">{error}</Callout>}

      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 font-serif text-lg font-semibold text-ink-900">Programas existentes</h2>
          {programs.length === 0 ? (
            <p className="text-sm text-ash-500">Todavía no hay programas.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-paper-border">
              {programs.map((program) => (
                <li key={program.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium text-ink-900">{program.title?.es}</p>
                    <p className="text-xs text-ash-500">{program.courses?.length ?? 0} cursos incluidos</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={program.status === "PUBLISHED" ? "success" : "outline"}>
                      {program.status === "PUBLISHED" ? "Publicado" : program.status === "ARCHIVED" ? "Archivado" : "Borrador"}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => run(() => adminApi.updateProgram(program.id, { status: program.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED" }))}
                    >
                      {program.status === "PUBLISHED" ? "Volver a borrador" : "Publicar"}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Nuevo programa</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="prog-title">Título</Label>
              <Input id="prog-title" value={form.titleEs} onChange={(e) => setForm((f) => ({ ...f, titleEs: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="prog-slug">Slug</Label>
              <Input id="prog-slug" placeholder="diplomado-en-..." value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="prog-price">Precio</Label>
              <Input id="prog-price" type="number" min="0" step="0.01" value={form.priceAmount} onChange={(e) => setForm((f) => ({ ...f, priceAmount: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="prog-currency">Moneda</Label>
              <Select id="prog-currency" value={form.priceCurrency} onChange={(e) => setForm((f) => ({ ...f, priceCurrency: e.target.value }))}>
                <option value="PEN">PEN</option>
                <option value="USD">USD</option>
              </Select>
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-ash-700">Cursos incluidos ({selectedCourseIds.length})</p>
            <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md border border-paper-border p-2">
              {courses.map((course) => (
                <label key={course.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-paper-muted">
                  <input type="checkbox" checked={selectedCourseIds.includes(course.id)} onChange={() => toggleCourse(course.id)} />
                  {course.title?.es}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Button disabled={busy || !form.slug.trim() || !form.titleEs.trim() || selectedCourseIds.length === 0} onClick={handleCreate}>
              Crear programa
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

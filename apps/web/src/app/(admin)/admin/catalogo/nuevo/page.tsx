"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, ApiError } from "@/lib/api-client";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

/**
 * Formulario de creación de curso. Antes el botón "Nuevo curso" del listado
 * de /admin/catalogo no tenía ninguna acción conectada, y no existía ninguna
 * pantalla para POST /admin/courses aunque el endpoint ya funcionaba.
 */
export default function NewCoursePage() {
  const router = useRouter();
  const [areas, setAreas] = useState<{ id: string; slug: string; name: any }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    slug: "",
    slugTouched: false,
    titleEs: "",
    areaId: "",
    modality: "RECORDED",
    level: "INITIAL",
    durationHours: "1",
    durationUnit: "HOURS",
    priceAmount: "0",
    priceCurrency: "PEN",
    certificationIncluded: true,
  });

  function refreshAreas() {
    adminApi
      .areas()
      .then(setAreas)
      .catch(() => setAreas([]));
  }

  useEffect(() => {
    refreshAreas();
  }, []);

  function slugify(text: string) {
    return text
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  async function handleCreateArea() {
    const name = prompt("Nombre de la nueva área (español):");
    if (!name || !name.trim()) return;
    try {
      const created = await adminApi.createArea({ slug: slugify(name), name: { es: name.trim(), en: name.trim() }, order: areas.length });
      refreshAreas();
      setForm((f) => ({ ...f, areaId: created.id }));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No pudimos crear el área.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const course = await adminApi.createCourse({
        slug: form.slug,
        title: { es: form.titleEs },
        areaId: form.areaId,
        modality: form.modality,
        level: form.level,
        durationHours: Number(form.durationHours),
        durationUnit: form.durationUnit,
        priceAmount: Number(form.priceAmount),
        priceCurrency: form.priceCurrency,
        certificationIncluded: form.certificationIncluded,
        status: "DRAFT",
      });
      router.push(`/admin/catalogo/${course.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos crear el curso.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="font-serif text-2xl font-semibold text-ink-900">Nuevo curso</h1>
      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {error && <Callout variant="danger">{error}</Callout>}
            <div>
              <Label htmlFor="titleEs">Título</Label>
              <Input
                id="titleEs"
                required
                value={form.titleEs}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    titleEs: e.target.value,
                    // Autogenera el slug a partir del título mientras el admin no
                    // lo haya tocado a mano — antes había que inventarlo desde cero.
                    slug: f.slugTouched ? f.slug : slugify(e.target.value),
                  }))
                }
              />
            </div>
            <div>
              <Label htmlFor="slug">Slug (URL)</Label>
              <Input
                id="slug"
                required
                placeholder="mi-curso-nuevo"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value, slugTouched: true }))}
              />
              <p className="mt-1 text-xs text-ash-500">
                Es la parte final de la URL del curso: se verá en <code>inkademy.com/cursos/{form.slug || "tu-slug"}</code>. Se
                genera solo desde el título; usa minúsculas, números y guiones, sin espacios ni tildes.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div>
                <Label htmlFor="areaId">Área</Label>
                <Select id="areaId" required value={form.areaId} onChange={(e) => setForm((f) => ({ ...f, areaId: e.target.value }))}>
                  <option value="">Selecciona un área</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name?.es ?? a.slug}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex items-end">
                <Button type="button" size="sm" variant="outline" onClick={handleCreateArea}>
                  + Nueva área
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="modality">Modalidad</Label>
                <Select id="modality" value={form.modality} onChange={(e) => setForm((f) => ({ ...f, modality: e.target.value }))}>
                  <option value="RECORDED">Grabado</option>
                  <option value="LIVE">En vivo</option>
                  <option value="HYBRID">Híbrido</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="level">Nivel</Label>
                <Select id="level" value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}>
                  <option value="INITIAL">Inicial</option>
                  <option value="INTERMEDIATE">Intermedio</option>
                  <option value="ADVANCED">Avanzado</option>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="durationHours">Duración</Label>
                <Input
                  id="durationHours"
                  type="number"
                  min="1"
                  required
                  value={form.durationHours}
                  onChange={(e) => setForm((f) => ({ ...f, durationHours: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="durationUnit">Unidad</Label>
                <Select id="durationUnit" value={form.durationUnit} onChange={(e) => setForm((f) => ({ ...f, durationUnit: e.target.value }))}>
                  <option value="HOURS">Horas</option>
                  <option value="WEEKS">Semanas</option>
                  <option value="MONTHS">Meses</option>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="priceAmount">Precio</Label>
                <Input
                  id="priceAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={form.priceAmount}
                  onChange={(e) => setForm((f) => ({ ...f, priceAmount: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="priceCurrency">Moneda</Label>
                <Select
                  id="priceCurrency"
                  value={form.priceCurrency}
                  onChange={(e) => setForm((f) => ({ ...f, priceCurrency: e.target.value }))}
                >
                  <option value="PEN">PEN</option>
                  <option value="USD">USD</option>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-ash-600">
              <input
                type="checkbox"
                checked={form.certificationIncluded}
                onChange={(e) => setForm((f) => ({ ...f, certificationIncluded: e.target.checked }))}
              />
              Incluye certificado digital
            </label>
            <p className="text-xs text-ash-500">
              El curso se crea como Borrador. Podrás agregar módulos, lecciones y sesiones en vivo, y publicarlo, en la
              siguiente pantalla.
            </p>
            <Button type="submit" size="lg" disabled={submitting}>
              {submitting ? "Creando…" : "Crear curso"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

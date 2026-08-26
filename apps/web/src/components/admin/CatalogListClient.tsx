"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AreaSummary, CourseCardDTO } from "@inkademy/shared";
import { LayoutGrid, List as ListIcon, Eye } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { SectionCarousel } from "@/components/catalog/SectionCarousel";
import { MODALITY_STYLE, offeringStyle } from "@/lib/offering-style";

type SortKey = "recent" | "title" | "area" | "modality" | "status";
type ViewMode = "list" | "gallery";
type Mode = "operativa" | "alumno";

function areaLabel(course: any): string {
  return course.area?.name?.es ?? course.area?.slug ?? course.areaSlug ?? "—";
}
function titleOf(course: any): string {
  return course.title?.es ?? course.title ?? "";
}

const STATUS_LABEL: Record<string, string> = { PUBLISHED: "Publicado", ARCHIVED: "Archivado", DRAFT: "Borrador" };
const STATUS_VARIANT: Record<string, "success" | "outline" | "neutral"> = { PUBLISHED: "success", ARCHIVED: "neutral", DRAFT: "outline" };

/**
 * "Que se vea más visual, podría verse por ejemplo la imagen del curso al
 * costadito, o podría seleccionarse diferentes maneras de verse: listado,
 * galería. Podría ordenarse por antigüedad, título, área, modalidad,
 * estado" — antes /admin/catalogo era una única tabla sin imagen, fija en
 * orden de creación, sin forma de cambiar el orden ni la vista.
 */
export function CatalogListClient({
  courses,
  sections,
  areas,
  publicCourses,
}: {
  courses: any[];
  sections?: { featured: CourseCardDTO[]; upcomingLive: CourseCardDTO[]; new: CourseCardDTO[]; recommendedPaths: CourseCardDTO[]; mostDemanded: CourseCardDTO[] };
  areas?: AreaSummary[];
  publicCourses?: CourseCardDTO[];
}) {
  const [mode, setMode] = useState<Mode>("operativa");
  const [view, setView] = useState<ViewMode>("list");
  const [sortKey, setSortKey] = useState<SortKey>("recent");

  const coursesByArea = useMemo(() => {
    if (!areas || !publicCourses) return [];
    return areas
      .map((a) => ({ area: a, courses: publicCourses.filter((c) => c.areaSlug === a.slug) }))
      .filter((g) => g.courses.length > 0);
  }, [areas, publicCourses]);

  const sorted = useMemo(() => {
    const copy = [...courses];
    switch (sortKey) {
      case "title":
        return copy.sort((a, b) => titleOf(a).localeCompare(titleOf(b), "es"));
      case "area":
        return copy.sort((a, b) => areaLabel(a).localeCompare(areaLabel(b), "es"));
      case "modality":
        return copy.sort((a, b) => (a.modality ?? "").localeCompare(b.modality ?? ""));
      case "status":
        return copy.sort((a, b) => (a.status ?? "").localeCompare(b.status ?? ""));
      case "recent":
      default:
        return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }, [courses, sortKey]);

  return (
    <div className="flex flex-col gap-4">
      {/* "El administrador debería ver el catálogo idénticamente a como lo
          ve un usuario, agrupado por Destacados/Próximos en Vivo/Nuevos/Más
          demandados, o también por área temática" — vista operativa (tabla
          para editar/ordenar) vs. vista pública real (las mismas secciones
          y el mismo CourseCard que ve cualquier visitante, reusando los
          mismos endpoints públicos). */}
      <div className="flex gap-1 self-start rounded-md border border-paper-border p-1">
        <Button size="sm" variant={mode === "operativa" ? "primary" : "ghost"} onClick={() => setMode("operativa")} className="gap-1.5">
          <ListIcon className="h-4 w-4" /> Vista operativa
        </Button>
        <Button size="sm" variant={mode === "alumno" ? "primary" : "ghost"} onClick={() => setMode("alumno")} className="gap-1.5">
          <Eye className="h-4 w-4" /> Vista como alumno
        </Button>
      </div>

      {mode === "alumno" ? (
        <div className="-mx-6 flex flex-col gap-2">
          {sections && (
            <>
              <SectionCarousel title="Destacados" courses={sections.featured} className="py-6" />
              <SectionCarousel title="Próximos en vivo" courses={sections.upcomingLive} className="py-6" />
              <SectionCarousel title="Nuevos" courses={sections.new} className="py-6" />
              <SectionCarousel title="Rutas recomendadas" courses={sections.recommendedPaths} className="py-6" />
              <SectionCarousel title="Más demandados" courses={sections.mostDemanded} className="py-6" />
            </>
          )}
          {coursesByArea.length > 0 && (
            <div>
              <p className="container mb-1 mt-4 text-xs font-semibold uppercase tracking-wide text-ash-500">Por área temática</p>
              {coursesByArea.map(({ area, courses: areaCourses }) => (
                <SectionCarousel key={area.id} title={area.name?.es ?? area.slug} courses={areaCourses} className="py-6" />
              ))}
            </div>
          )}
          {!sections && coursesByArea.length === 0 && (
            <p className="container py-6 text-sm text-ash-500">No pudimos cargar la vista pública del catálogo.</p>
          )}
        </div>
      ) : (
        <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ash-500">Ordenar por</label>
          <Select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="h-9 text-sm">
            <option value="recent">Más recientes (antigüedad)</option>
            <option value="title">Título (A-Z)</option>
            <option value="area">Área</option>
            <option value="modality">Modalidad</option>
            <option value="status">Estado</option>
          </Select>
        </div>
        <div className="flex gap-1 rounded-md border border-paper-border p-1">
          <Button size="sm" variant={view === "list" ? "primary" : "ghost"} onClick={() => setView("list")} className="gap-1.5">
            <ListIcon className="h-4 w-4" /> Lista
          </Button>
          <Button size="sm" variant={view === "gallery" ? "primary" : "ghost"} onClick={() => setView("gallery")} className="gap-1.5">
            <LayoutGrid className="h-4 w-4" /> Galería
          </Button>
        </div>
      </div>

      {view === "list" ? (
        <div className="overflow-x-auto rounded-lg border border-paper-border bg-paper">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-paper-border text-ash-500">
              <tr>
                <th className="p-4 font-medium">Curso</th>
                <th className="p-4 font-medium">Área</th>
                <th className="p-4 font-medium">Modalidad</th>
                <th className="p-4 font-medium">Estado</th>
                <th className="p-4 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-border">
              {sorted.map((course) => {
                const modalityStyle = offeringStyle(MODALITY_STYLE, course.modality);
                return (
                  <tr key={course.id}>
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        {course.coverImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={course.coverImageUrl} alt="" className="h-12 w-16 flex-none rounded object-cover" />
                        ) : (
                          <div className="flex h-12 w-16 flex-none items-center justify-center rounded bg-ink-100 text-xs font-semibold text-ink-500">
                            {titleOf(course).charAt(0)}
                          </div>
                        )}
                        <span className="font-medium text-ink-900">{titleOf(course)}</span>
                      </div>
                    </td>
                    <td className="p-3 text-ash-600">{areaLabel(course)}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium ${modalityStyle.classes}`}>
                        <modalityStyle.icon className="h-3 w-3" aria-hidden="true" />
                        {course.modality}
                      </span>
                    </td>
                    <td className="p-3">
                      <Badge variant={STATUS_VARIANT[course.status] ?? "outline"}>{STATUS_LABEL[course.status] ?? course.status}</Badge>
                    </td>
                    <td className="p-3">
                      <Link href={`/admin/catalogo/${course.id}`}>
                        <Button size="sm" variant="ghost">
                          Editar
                        </Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((course) => {
            const modalityStyle = offeringStyle(MODALITY_STYLE, course.modality);
            return (
              <Link
                key={course.id}
                href={`/admin/catalogo/${course.id}`}
                className="flex flex-col overflow-hidden rounded-lg border border-paper-border bg-paper shadow-card transition-shadow hover:shadow-raised"
              >
                {course.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={course.coverImageUrl} alt="" className="h-32 w-full object-cover" />
                ) : (
                  <div className="flex h-32 items-center justify-center bg-ink-100 font-serif text-3xl font-semibold text-ink-400">
                    {titleOf(course).charAt(0)}
                  </div>
                )}
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <p className="font-serif font-semibold leading-snug text-ink-900">{titleOf(course)}</p>
                  <p className="text-xs text-ash-500">{areaLabel(course)}</p>
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                    <span className={`inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium ${modalityStyle.classes}`}>
                      <modalityStyle.icon className="h-3 w-3" aria-hidden="true" />
                      {course.modality}
                    </span>
                    <Badge variant={STATUS_VARIANT[course.status] ?? "outline"}>{STATUS_LABEL[course.status] ?? course.status}</Badge>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
        </>
      )}
    </div>
  );
}

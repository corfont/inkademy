"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Trash2, Radio } from "lucide-react";
import { adminApi, liveSessionApi, ApiError } from "@/lib/api-client";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";
import { RescheduleSessionControl } from "./RescheduleSessionControl";
import { FileDropzone } from "./FileDropzone";
import { useAuth } from "@/components/providers/AuthProvider";

/**
 * Editor de contenido de un curso: metadata, módulos → lecciones →
 * materiales, y sesiones en vivo. Antes de esto no existía ninguna pantalla
 * para gestionar contenido — solo se podía precargar vía prisma/seed.ts.
 *
 * Estrategia simple: cada mutación llama al API y luego `router.refresh()`
 * para volver a traer el detalle completo del curso desde el server
 * component padre, en vez de mantener un caché local optimista.
 */
export function CourseEditor({ course }: { course: any }) {
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
      setError(err instanceof ApiError ? err.message : "Ocurrió un error. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink-900">{course.title?.es ?? course.slug}</h1>
          <p className="text-sm text-ash-500">/{course.slug}</p>
        </div>
        <StatusToggle status={course.status} busy={busy} onChange={(status) => run(() => adminApi.updateCourse(course.id, { status }))} />
      </div>

      {error && <Callout variant="danger">{error}</Callout>}

      <MetadataSection course={course} busy={busy} onSave={(patch) => run(() => adminApi.updateCourse(course.id, patch))} />

      <CourseStaffSection courseId={course.id} />

      <ContentSection course={course} busy={busy} run={run} />

      <LiveSessionsSection course={course} busy={busy} run={run} />

      <AssessmentsSection courseId={course.id} />
    </div>
  );
}

function StatusToggle({ status, busy, onChange }: { status: string; busy: boolean; onChange: (s: string) => void }) {
  const variant = status === "PUBLISHED" ? "success" : status === "ARCHIVED" ? "outline" : "neutral";
  const label = status === "PUBLISHED" ? "Publicado" : status === "ARCHIVED" ? "Archivado (oculto)" : "Borrador";
  return (
    <div className="flex items-center gap-3">
      <Badge variant={variant as any}>{label}</Badge>
      {status === "ARCHIVED" ? (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onChange("DRAFT")}>
          Restaurar a borrador
        </Button>
      ) : (
        <>
          {status !== "PUBLISHED" ? (
            <Button size="sm" disabled={busy} onClick={() => onChange("PUBLISHED")}>
              Publicar
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onChange("DRAFT")}>
              Volver a borrador
            </Button>
          )}
          {/* Archivar: oculta el curso del catálogo público de inmediato (no aparece ni por URL directa),
              a diferencia de "borrador" que es el estado normal antes de publicar por primera vez. */}
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              if (confirm("¿Archivar este curso? Dejará de verse en el catálogo público de inmediato, incluso por URL directa. Los alumnos ya matriculados conservan su acceso.")) {
                onChange("ARCHIVED");
              }
            }}
          >
            Ocultar (archivar)
          </Button>
        </>
      )}
    </div>
  );
}

function MetadataSection({
  course,
  busy,
  onSave,
}: {
  course: any;
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => void;
}) {
  const [titleEs, setTitleEs] = useState(course.title?.es ?? "");
  const [priceAmount, setPriceAmount] = useState(String(course.priceAmount ?? "0"));
  const [certificateTemplateId, setCertificateTemplateId] = useState(course.certificateTemplateId ?? "");
  const [language, setLanguage] = useState(course.language ?? "es");
  const [templates, setTemplates] = useState<any[]>([]);
  const [areas, setAreas] = useState<any[]>([]);
  const [areaId, setAreaId] = useState(course.areaId ?? course.area?.id ?? "");
  const [durationHours, setDurationHours] = useState(String(course.durationHours ?? "0"));
  const [durationUnit, setDurationUnit] = useState(course.durationUnit ?? "HOURS");
  const [coverImageAssetId, setCoverImageAssetId] = useState(course.coverImageAssetId ?? null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState(course.coverImageUrl ?? null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [syllabusAssetId, setSyllabusAssetId] = useState(course.syllabusAssetId ?? null);
  const [syllabusUrl, setSyllabusUrl] = useState(course.syllabusUrl ?? null);
  const [uploadingSyllabus, setUploadingSyllabus] = useState(false);
  const [discountPercent, setDiscountPercent] = useState(course.discountPercent != null ? String(course.discountPercent) : "");
  const [discountExpiresAt, setDiscountExpiresAt] = useState(
    course.discountExpiresAt ? new Date(course.discountExpiresAt).toISOString().slice(0, 10) : "",
  );

  function refreshAreas() {
    adminApi
      .areas()
      .then(setAreas)
      .catch(() => setAreas([]));
  }

  useEffect(() => {
    adminApi
      .certificateTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]));
    refreshAreas();
  }, []);

  async function handleCreateArea() {
    const name = prompt("Nombre de la nueva área (español):");
    if (!name || !name.trim()) return;
    const slug = name
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    try {
      const created = await adminApi.createArea({ slug, name: { es: name.trim(), en: name.trim() }, order: areas.length });
      refreshAreas();
      setAreaId(created.id);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No pudimos crear el área.");
    }
  }

  async function handleCoverUpload(file: File) {
    setUploadingCover(true);
    try {
      const { assetId, url } = await adminApi.uploadAsset(file);
      setCoverImageAssetId(assetId);
      setCoverPreviewUrl(url);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No pudimos subir la imagen de portada.");
    } finally {
      setUploadingCover(false);
    }
  }

  async function handleSyllabusUpload(file: File) {
    setUploadingSyllabus(true);
    try {
      const { assetId, url } = await adminApi.uploadAsset(file);
      setSyllabusAssetId(assetId);
      setSyllabusUrl(url);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No pudimos subir el sílabo.");
    } finally {
      setUploadingSyllabus(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <h2 className="font-serif text-lg font-semibold text-ink-900">Datos generales</h2>
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <div>
            <Label htmlFor="edit-title">Título</Label>
            <Input id="edit-title" value={titleEs} onChange={(e) => setTitleEs(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="edit-price">Precio ({course.priceCurrency ?? "PEN"})</Label>
            <Input id="edit-price" type="number" min="0" step="0.01" value={priceAmount} onChange={(e) => setPriceAmount(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <div>
            <Label htmlFor="edit-area">Área</Label>
            <Select id="edit-area" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
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
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <div>
            <Label htmlFor="edit-duration">Duración</Label>
            <Input id="edit-duration" type="number" min="0" step="0.5" value={durationHours} onChange={(e) => setDurationHours(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="edit-duration-unit">Unidad</Label>
            <Select id="edit-duration-unit" value={durationUnit} onChange={(e) => setDurationUnit(e.target.value)}>
              <option value="HOURS">Horas</option>
              <option value="WEEKS">Semanas</option>
              <option value="MONTHS">Meses</option>
            </Select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 rounded-md bg-paper-muted p-3">
          <div>
            <Label htmlFor="edit-discount">Descuento (%)</Label>
            <Input
              id="edit-discount"
              type="number"
              min="0"
              max="90"
              placeholder="Sin descuento"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="edit-discount-expires">Vence el (opcional)</Label>
            <Input
              id="edit-discount-expires"
              type="date"
              value={discountExpiresAt}
              onChange={(e) => setDiscountExpiresAt(e.target.value)}
              disabled={!discountPercent}
            />
          </div>
          {discountPercent && Number(discountPercent) > 0 && (
            <p className="sm:col-span-2 text-sm text-success">
              Precio con descuento: {(Number(priceAmount) * (1 - Number(discountPercent) / 100)).toFixed(2)} {course.priceCurrency ?? "PEN"}
              {discountExpiresAt ? ` — hasta el ${discountExpiresAt}` : ""}
            </p>
          )}
        </div>
        <div>
          <Label>Imagen de portada</Label>
          <div className="mt-1 flex items-center gap-4">
            {coverPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverPreviewUrl} alt="" className="h-16 w-28 flex-none rounded-md object-cover" />
            ) : (
              <div className="flex h-16 w-28 flex-none items-center justify-center rounded-md bg-paper-muted text-xs text-ash-500">
                Sin imagen
              </div>
            )}
            <div className="flex-1">
              <FileDropzone
                accept="image/*"
                busy={uploadingCover}
                label="Subir portada"
                hint="Arrastra una imagen aquí o haz click (JPG/PNG)"
                onFile={handleCoverUpload}
              />
            </div>
          </div>
        </div>
        <div>
          <Label>Sílabo del curso</Label>
          <p className="mb-1 text-xs text-ash-500">El alumno lo verá disponible para descargar dentro del aula.</p>
          <div className="flex items-center gap-4">
            {syllabusUrl ? (
              <a href={syllabusUrl} target="_blank" rel="noreferrer" className="flex h-16 w-28 flex-none items-center justify-center rounded-md bg-paper-muted text-xs text-ink-700 underline">
                Ver sílabo
              </a>
            ) : (
              <div className="flex h-16 w-28 flex-none items-center justify-center rounded-md bg-paper-muted text-xs text-ash-500">
                Sin sílabo
              </div>
            )}
            <div className="flex-1">
              <FileDropzone
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                busy={uploadingSyllabus}
                label={syllabusUrl ? "Reemplazar sílabo" : "Subir sílabo"}
                hint="PDF o Word"
                onFile={handleSyllabusUpload}
              />
            </div>
          </div>
        </div>
        <div className="max-w-xs">
          <Label htmlFor="edit-language">Idioma del curso</Label>
          <Select id="edit-language" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="es">Español</option>
            <option value="en">English</option>
            <option value="pt">Português</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="edit-cert-template">Plantilla de certificado</Label>
          <Select id="edit-cert-template" value={certificateTemplateId} onChange={(e) => setCertificateTemplateId(e.target.value)}>
            <option value="">Automática (la más reciente activa en el idioma del alumno)</option>
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id} disabled={!tpl.active}>
                {tpl.name} {!tpl.active ? "(inactiva)" : ""}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              onSave({
                title: { ...course.title, es: titleEs },
                priceAmount: Number(priceAmount),
                certificateTemplateId: certificateTemplateId || null,
                language,
                areaId,
                durationHours: Number(durationHours),
                durationUnit,
                coverImageAssetId,
                syllabusAssetId,
                discountPercent: discountPercent ? Number(discountPercent) : null,
                discountExpiresAt: discountPercent && discountExpiresAt ? discountExpiresAt : null,
              })
            }
          >
            Guardar cambios
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ContentSection({ course, busy, run }: { course: any; busy: boolean; run: (a: () => Promise<unknown>) => void }) {
  const [newModuleTitle, setNewModuleTitle] = useState("");

  return (
    <Card>
      <CardContent className="flex flex-col gap-6 p-6">
        <h2 className="font-serif text-lg font-semibold text-ink-900">Módulos y lecciones</h2>

        {course.modules.length === 0 && <p className="text-sm text-ash-500">Este curso todavía no tiene módulos.</p>}

        <div className="flex flex-col gap-6">
          {course.modules.map((mod: any) => (
            <ModuleBlock key={mod.id} courseId={course.id} module={mod} busy={busy} run={run} />
          ))}
        </div>

        <div className="flex items-end gap-3 border-t border-paper-border pt-4">
          <div className="flex-1">
            <Label htmlFor="new-module">Nuevo módulo</Label>
            <Input id="new-module" placeholder="Título del módulo" value={newModuleTitle} onChange={(e) => setNewModuleTitle(e.target.value)} />
          </div>
          <Button
            disabled={busy || !newModuleTitle.trim()}
            onClick={() => {
              run(() => adminApi.createModule(course.id, { title: { es: newModuleTitle }, order: course.modules.length }));
              setNewModuleTitle("");
            }}
          >
            Agregar módulo
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ModuleBlock({ courseId, module: mod, busy, run }: { courseId: string; module: any; busy: boolean; run: any }) {
  const [newLesson, setNewLesson] = useState({ title: "", contentType: "VIDEO" });

  return (
    <div className="rounded-lg border border-paper-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-medium text-ink-900">{mod.title?.es ?? "(sin título)"}</p>
        <button
          type="button"
          className="text-ash-400 hover:text-danger"
          disabled={busy}
          onClick={() => confirm("¿Eliminar este módulo y todo su contenido?") && run(() => adminApi.deleteModule(mod.id))}
          aria-label="Eliminar módulo"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <ModuleMaterialsSection module={mod} busy={busy} run={run} />

      <ul className="mt-4 flex flex-col gap-2">
        {mod.lessons.map((lesson: any) => (
          <LessonRow key={lesson.id} lesson={lesson} busy={busy} run={run} />
        ))}
      </ul>

      <div className="mt-3 flex items-end gap-2 border-t border-paper-border pt-3">
        <Input
          placeholder="Título de la lección"
          className="flex-1"
          value={newLesson.title}
          onChange={(e) => setNewLesson((l) => ({ ...l, title: e.target.value }))}
        />
        <Select
          className="w-36"
          value={newLesson.contentType}
          onChange={(e) => setNewLesson((l) => ({ ...l, contentType: e.target.value }))}
        >
          <option value="VIDEO">Video</option>
          <option value="PDF">PDF</option>
          <option value="LINK">Link</option>
          <option value="TEXT">Texto</option>
        </Select>
        <Button
          size="sm"
          disabled={busy || !newLesson.title.trim()}
          onClick={() => {
            run(() =>
              adminApi.createLesson(mod.id, {
                title: { es: newLesson.title },
                contentType: newLesson.contentType,
                order: mod.lessons.length,
              }),
            );
            setNewLesson({ title: "", contentType: "VIDEO" });
          }}
        >
          Agregar lección
        </Button>
      </div>
    </div>
  );
}

const CATEGORY_LABEL: Record<string, string> = { MAIN: "Principal", SUPPLEMENTARY: "Complementario" };

/** Fila de material reutilizada tanto para materiales de módulo como de lección — cambia categoría, visibilidad, o elimina. */
function MaterialItem({ material, busy, run }: { material: any; busy: boolean; run: (a: () => Promise<unknown>) => void }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded bg-paper px-2 py-1 text-xs text-ash-600">
      <a href={material.assetUrl ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:underline">
        📎 {material.title}
      </a>
      <div className="flex items-center gap-2">
        <Select
          className="h-7 w-32 text-xs"
          value={material.category ?? "MAIN"}
          onChange={(e) => run(() => adminApi.updateMaterial(material.id, { category: e.target.value as "MAIN" | "SUPPLEMENTARY" }))}
        >
          <option value="MAIN">Principal</option>
          <option value="SUPPLEMENTARY">Complementario</option>
        </Select>
        <button
          type="button"
          className={material.visible ? "text-success" : "text-ash-400"}
          title={material.visible ? "Visible para el alumno — click para ocultar" : "Oculto para el alumno — click para mostrar"}
          disabled={busy}
          onClick={() => run(() => adminApi.updateMaterial(material.id, { visible: !material.visible }))}
        >
          {material.visible ? "Visible" : "Oculto"}
        </button>
        <button type="button" className="text-ash-400 hover:text-danger" disabled={busy} onClick={() => run(() => adminApi.deleteMaterial(material.id))}>
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </li>
  );
}

/** Lecturas/documentos de un módulo entero (principal y complementario) — no atadas a una lección puntual. */
function ModuleMaterialsSection({ module: mod, busy, run }: { module: any; busy: boolean; run: (a: () => Promise<unknown>) => void }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<"MAIN" | "SUPPLEMENTARY">("MAIN");
  const [uploading, setUploading] = useState(false);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const { assetId } = await adminApi.uploadAsset(file);
      await run(() => adminApi.createModuleMaterial(mod.id, { title: title || file.name, assetId, kind: kindFromFile(file), category }));
      setTitle("");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No pudimos subir el archivo.");
    } finally {
      setUploading(false);
    }
  }

  const materials: any[] = mod.materials ?? [];

  return (
    <div className="rounded-md bg-paper-muted p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ash-500">Lecturas y documentos del módulo</p>
      {materials.length > 0 && (
        <ul className="mb-2 flex flex-col gap-1">
          {materials.map((m) => (
            <MaterialItem key={m.id} material={m} busy={busy} run={run} />
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Título (opcional)"
          className="h-8 max-w-xs text-xs"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Select className="h-8 w-32 text-xs" value={category} onChange={(e) => setCategory(e.target.value as "MAIN" | "SUPPLEMENTARY")}>
          <option value="MAIN">Principal</option>
          <option value="SUPPLEMENTARY">Complementario</option>
        </Select>
        <DropLabel busy={uploading} label="Agregar lectura" small onFile={handleUpload} />
      </div>
    </div>
  );
}

/** Adivina un "kind" legible a partir del tipo de archivo — PPT/Word/Excel/imagen/video/PDF/otro. */
function kindFromFile(file: File): string {
  const type = file.type;
  const name = file.name.toLowerCase();
  if (type.includes("presentation") || /\.(pptx?|key)$/.test(name)) return "slide";
  if (type.includes("word") || /\.docx?$/.test(name)) return "doc";
  if (type.includes("sheet") || /\.xlsx?$/.test(name)) return "sheet";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type === "application/pdf") return "pdf";
  return "file";
}

function LessonRow({ lesson, busy, run }: { lesson: any; busy: boolean; run: any }) {
  const router = useRouter();
  const [newMaterialTitle, setNewMaterialTitle] = useState("");
  const [newMaterialCategory, setNewMaterialCategory] = useState<"MAIN" | "SUPPLEMENTARY">("MAIN");
  const [uploading, setUploading] = useState(false);

  async function handleVideoUpload(file: File) {
    setUploading(true);
    try {
      const { assetId } = await adminApi.uploadAsset(file);
      await adminApi.updateLesson(lesson.id, { videoAssetId: assetId });
      router.refresh();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No pudimos subir el archivo.");
    } finally {
      setUploading(false);
    }
  }

  async function handleMaterialUpload(file: File) {
    setUploading(true);
    try {
      const { assetId } = await adminApi.uploadAsset(file);
      await run(() =>
        adminApi.createMaterial(lesson.id, {
          title: newMaterialTitle || file.name,
          assetId,
          kind: kindFromFile(file),
          category: newMaterialCategory,
        }),
      );
      setNewMaterialTitle("");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No pudimos subir el archivo.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <li className="rounded-md bg-paper-muted p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{lesson.contentType}</Badge>
          <span className="text-sm font-medium text-ink-900">{lesson.title?.es}</span>
          {lesson.isFreePreview && <Badge variant="gold">Vista previa gratis</Badge>}
        </div>
        <button
          type="button"
          className="text-ash-400 hover:text-danger"
          disabled={busy}
          onClick={() => confirm("¿Eliminar esta lección?") && run(() => adminApi.deleteLesson(lesson.id))}
          aria-label="Eliminar lección"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {lesson.contentType === "VIDEO" && (
        <div className="mt-2 flex items-center gap-2 text-xs text-ash-600">
          {lesson.videoAssetId ? (
            <span>Video cargado ({lesson.videoAssetId.split("/").pop()})</span>
          ) : (
            <span>Sin video todavía</span>
          )}
          <DropLabel accept="video/*" busy={uploading} label="Subir video" onFile={handleVideoUpload} />
        </div>
      )}

      {lesson.materials?.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {lesson.materials.map((mat: any) => (
            <MaterialItem key={mat.id} material={mat} busy={busy} run={run} />
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Título del material (opcional)"
          className="h-8 max-w-xs text-xs"
          value={newMaterialTitle}
          onChange={(e) => setNewMaterialTitle(e.target.value)}
        />
        <Select className="h-8 w-32 text-xs" value={newMaterialCategory} onChange={(e) => setNewMaterialCategory(e.target.value as "MAIN" | "SUPPLEMENTARY")}>
          <option value="MAIN">Principal</option>
          <option value="SUPPLEMENTARY">Complementario</option>
        </Select>
        <DropLabel busy={uploading} label="Agregar material" small onFile={handleMaterialUpload} />
      </div>
      <p className="mt-1 text-[11px] text-ash-400">Acepta PDF, Word, Excel, PPT, imágenes (PNG/JPG) y video.</p>
    </li>
  );
}

/** Etiqueta compacta de subida (click o arrastrar-y-soltar) para filas angostas — la versión completa con recuadro es `FileDropzone`. */
function DropLabel({
  accept,
  busy,
  label,
  small,
  onFile,
}: {
  accept?: string;
  busy?: boolean;
  label: string;
  small?: boolean;
  onFile: (file: File) => void;
}) {
  const [dragging, setDragging] = useState(false);
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file && !busy) onFile(file);
      }}
      className={`flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 ${small ? "text-xs" : "text-sm"} text-ink-700 hover:underline ${
        dragging ? "bg-paper-muted ring-1 ring-ink-400" : ""
      }`}
    >
      <UploadCloud className={small ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden="true" />
      {busy ? "Subiendo…" : label}
      <input
        type="file"
        accept={accept}
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </label>
  );
}

function LiveSessionsSection({ course, busy, run }: { course: any; busy: boolean; run: any }) {
  const [form, setForm] = useState({ startsAt: "", endsAt: "", capacity: "" });

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <h2 className="font-serif text-lg font-semibold text-ink-900">Sesiones en vivo</h2>

        {course.liveSessions.length === 0 && <p className="text-sm text-ash-500">Todavía no hay sesiones programadas.</p>}

        <ul className="flex flex-col gap-2">
          {course.liveSessions.map((session: any) => (
            <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-paper-muted p-3 text-sm">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-ink-700" aria-hidden="true" />
                <div>
                  <p className="font-medium text-ink-900">
                    {new Date(session.startsAt).toLocaleString("es-PE")} — {new Date(session.endsAt).toLocaleTimeString("es-PE")}
                  </p>
                  <p className="text-xs text-ash-500">
                    {session.status} · Teams: {session.joinUrl ? "listo" : "sin generar"}
                    {session.providerMeetingId?.startsWith("simulated-") && " (simulado, sin credenciales reales de Graph)"}
                  </p>
                </div>
              </div>
              {session.status !== "COMPLETED" && session.status !== "CANCELLED" && (
                <RescheduleSessionControl sessionId={session.id} currentStartsAt={session.startsAt} currentEndsAt={session.endsAt} />
              )}
            </li>
          ))}
        </ul>

        <div className="grid gap-3 border-t border-paper-border pt-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="session-start">Inicio</Label>
            <Input
              id="session-start"
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="session-end">Fin</Label>
            <Input
              id="session-end"
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="session-capacity">Capacidad (opcional)</Label>
            <Input
              id="session-capacity"
              type="number"
              min="1"
              value={form.capacity}
              onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
            />
          </div>
        </div>
        <div>
          <Button
            disabled={busy || !form.startsAt || !form.endsAt}
            onClick={() => {
              run(() =>
                liveSessionApi.create({
                  courseId: course.id,
                  startsAt: new Date(form.startsAt).toISOString(),
                  endsAt: new Date(form.endsAt).toISOString(),
                  capacity: form.capacity ? Number(form.capacity) : undefined,
                }),
              );
              setForm({ startsAt: "", endsAt: "", capacity: "" });
            }}
          >
            Programar sesión (crea la reunión de Teams)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Evaluaciones (exámenes/quizzes) y sus preguntas — antes no existía ningún
// módulo de autoría: el alumno podía presentar exámenes y el staff podía
// calificar respuestas abiertas, pero la única forma de crear una
// Assessment/Question era editando prisma/seed.ts a mano.
// ============================================================================

const QUESTION_TYPE_LABEL: Record<string, string> = {
  SINGLE_CHOICE: "Opción única",
  MULTI_CHOICE: "Opción múltiple",
  TRUE_FALSE: "Verdadero/Falso",
  SHORT_ANSWER: "Respuesta corta",
  OPEN: "Respuesta abierta (calificación manual)",
};

function AssessmentsSection({ courseId }: { courseId: string }) {
  const [assessments, setAssessments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  async function refresh() {
    try {
      const data = await adminApi.assessments(courseId);
      setAssessments(data);
    } catch {
      setAssessments([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  async function handleCreate() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await adminApi.createAssessment(courseId, { title: { es: newTitle } });
      setNewTitle("");
      await refresh();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No pudimos crear la evaluación.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <h2 className="font-serif text-lg font-semibold text-ink-900">Evaluaciones</h2>
        {loading ? (
          <p className="text-sm text-ash-500">Cargando…</p>
        ) : assessments.length === 0 ? (
          <p className="text-sm text-ash-500">Todavía no hay evaluaciones para este curso.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {assessments.map((a) => (
              <AssessmentBlock key={a.id} assessment={a} onChange={refresh} />
            ))}
          </div>
        )}
        <div className="flex gap-2 border-t border-paper-border pt-4">
          <Input placeholder="Título de la nueva evaluación" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
          <Button size="sm" disabled={creating || !newTitle.trim()} onClick={handleCreate}>
            + Nueva evaluación
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AssessmentBlock({ assessment, onChange }: { assessment: any; onChange: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [minScore, setMinScore] = useState(String(assessment.minScore));
  const [maxAttempts, setMaxAttempts] = useState(String(assessment.maxAttempts));
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(assessment.timeLimitMinutes ? String(assessment.timeLimitMinutes) : "");
  const [displayMode, setDisplayMode] = useState(assessment.displayMode ?? "ALL_AT_ONCE");
  const [busy, setBusy] = useState(false);

  async function handleSaveRules() {
    setBusy(true);
    try {
      await adminApi.updateAssessment(assessment.id, {
        minScore: Number(minScore),
        maxAttempts: Number(maxAttempts),
        timeLimitMinutes: timeLimitMinutes ? Number(timeLimitMinutes) : undefined,
        displayMode,
      });
      onChange();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No pudimos guardar las reglas.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar "${assessment.title?.es}"? Solo se puede si nadie la ha presentado todavía.`)) return;
    setBusy(true);
    try {
      await adminApi.deleteAssessment(assessment.id);
      onChange();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No pudimos eliminar la evaluación.");
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-paper-border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-ink-900">{assessment.title?.es}</p>
          <p className="text-xs text-ash-500">
            {assessment.questions?.length ?? 0} pregunta{assessment.questions?.length === 1 ? "" : "s"} ·{" "}
            {assessment._count?.attempts ?? 0} intento(s) de alumnos
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setExpanded((e) => !e)}>
            {expanded ? "Ocultar" : "Gestionar"}
          </Button>
          <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-bg" disabled={busy} onClick={handleDelete}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 flex flex-col gap-4 border-t border-paper-border pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor={`minScore-${assessment.id}`}>Nota mínima (%)</Label>
              <Input
                id={`minScore-${assessment.id}`}
                type="number"
                min="0"
                max="100"
                value={minScore}
                onChange={(e) => setMinScore(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor={`maxAttempts-${assessment.id}`}>Intentos máximos</Label>
              <Input
                id={`maxAttempts-${assessment.id}`}
                type="number"
                min="1"
                value={maxAttempts}
                onChange={(e) => setMaxAttempts(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor={`timeLimit-${assessment.id}`}>Límite de tiempo (min)</Label>
              <Input
                id={`timeLimit-${assessment.id}`}
                type="number"
                min="1"
                value={timeLimitMinutes}
                onChange={(e) => setTimeLimitMinutes(e.target.value)}
                placeholder="Sin límite"
              />
            </div>
            <div>
              <Label htmlFor={`displayMode-${assessment.id}`}>Cómo se muestran las preguntas</Label>
              <Select id={`displayMode-${assessment.id}`} value={displayMode} onChange={(e) => setDisplayMode(e.target.value)}>
                <option value="ALL_AT_ONCE">Todas juntas en una pantalla</option>
                <option value="ONE_BY_ONE">Una por una (sin volver atrás)</option>
              </Select>
            </div>
          </div>
          <Button size="sm" variant="outline" disabled={busy} onClick={handleSaveRules} className="self-start">
            Guardar reglas
          </Button>

          <div className="flex flex-col gap-3 border-t border-paper-border pt-4">
            <h3 className="text-sm font-semibold text-ink-900">Preguntas</h3>
            {(assessment.questions ?? []).map((q: any) => (
              <QuestionRow key={q.id} question={q} onChange={onChange} />
            ))}
            <NewQuestionForm assessmentId={assessment.id} onChange={onChange} />
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionRow({ question, onChange }: { question: any; onChange: () => void }) {
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!confirm("¿Eliminar esta pregunta?")) return;
    setBusy(true);
    try {
      await adminApi.deleteQuestion(question.id);
      onChange();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No pudimos eliminar la pregunta.");
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-md bg-paper-muted p-3 text-sm">
      <div>
        <p className="text-ink-900">{question.text?.es}</p>
        <p className="text-xs text-ash-500">
          {QUESTION_TYPE_LABEL[question.type] ?? question.type} · {question.points} pto(s)
          {question.options?.length ? ` · ${question.options.length} opciones` : ""}
        </p>
      </div>
      <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-bg" disabled={busy} onClick={handleDelete}>
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

function NewQuestionForm({ assessmentId, onChange }: { assessmentId: string; onChange: () => void }) {
  const [type, setType] = useState("SINGLE_CHOICE");
  const [text, setText] = useState("");
  const [optionsText, setOptionsText] = useState(""); // una opción por línea
  const [correctIndex, setCorrectIndex] = useState(0); // SINGLE_CHOICE/TRUE_FALSE
  const [correctIndexes, setCorrectIndexes] = useState<number[]>([]); // MULTI_CHOICE
  const [shortAnswer, setShortAnswer] = useState("");
  const [points, setPoints] = useState("1");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const needsOptions = type === "SINGLE_CHOICE" || type === "MULTI_CHOICE";
  const optionLines = optionsText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  async function handleSubmit() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      let options: { id: string; text: string }[] | undefined;
      let correctAnswer: string | string[] | undefined;

      if (type === "TRUE_FALSE") {
        options = [
          { id: "true", text: "Verdadero" },
          { id: "false", text: "Falso" },
        ];
        correctAnswer = correctIndex === 0 ? "true" : "false";
      } else if (needsOptions) {
        options = optionLines.map((line, i) => ({ id: `opt-${i}`, text: line }));
        correctAnswer = type === "SINGLE_CHOICE" ? `opt-${correctIndex}` : correctIndexes.map((i) => `opt-${i}`);
      } else if (type === "SHORT_ANSWER") {
        correctAnswer = shortAnswer;
      }

      await adminApi.createQuestion(assessmentId, {
        type,
        text: { es: text },
        options,
        correctAnswer,
        points: Number(points) || 1,
      });
      setText("");
      setOptionsText("");
      setShortAnswer("");
      setPoints("1");
      setCorrectIndex(0);
      setCorrectIndexes([]);
      setOpen(false);
      onChange();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No pudimos crear la pregunta.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="self-start">
        + Agregar pregunta
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-paper-border p-4">
      <div>
        <Label htmlFor="q-type">Tipo de pregunta</Label>
        <Select
          id="q-type"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setCorrectIndex(0);
            setCorrectIndexes([]);
          }}
        >
          <option value="SINGLE_CHOICE">Opción única</option>
          <option value="MULTI_CHOICE">Opción múltiple</option>
          <option value="TRUE_FALSE">Verdadero/Falso</option>
          <option value="SHORT_ANSWER">Respuesta corta</option>
          <option value="OPEN">Respuesta abierta (calificación manual)</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="q-text">Pregunta</Label>
        <Input id="q-text" value={text} onChange={(e) => setText(e.target.value)} />
      </div>

      {type === "TRUE_FALSE" && (
        <div>
          <Label>Respuesta correcta</Label>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={correctIndex === 0} onChange={() => setCorrectIndex(0)} /> Verdadero
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={correctIndex === 1} onChange={() => setCorrectIndex(1)} /> Falso
            </label>
          </div>
        </div>
      )}

      {needsOptions && (
        <div>
          <Label htmlFor="q-options">Opciones (una por línea)</Label>
          <textarea
            id="q-options"
            className="min-h-[5rem] w-full rounded-md border border-paper-border bg-paper p-2 text-sm"
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            placeholder={"Opción A\nOpción B\nOpción C"}
          />
          {optionLines.length > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              <p className="text-xs text-ash-500">Marca la(s) correcta(s):</p>
              {optionLines.map((line, i) =>
                type === "SINGLE_CHOICE" ? (
                  <label key={i} className="flex items-center gap-1.5 text-sm">
                    <input type="radio" checked={correctIndex === i} onChange={() => setCorrectIndex(i)} />
                    {line}
                  </label>
                ) : (
                  <label key={i} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={correctIndexes.includes(i)}
                      onChange={(e) =>
                        setCorrectIndexes((prev) => (e.target.checked ? [...prev, i] : prev.filter((x) => x !== i)))
                      }
                    />
                    {line}
                  </label>
                ),
              )}
            </div>
          )}
        </div>
      )}

      {type === "SHORT_ANSWER" && (
        <div>
          <Label htmlFor="q-short">Respuesta correcta (coincidencia exacta)</Label>
          <Input id="q-short" value={shortAnswer} onChange={(e) => setShortAnswer(e.target.value)} />
        </div>
      )}

      {type === "OPEN" && (
        <Callout variant="info">Esta pregunta queda pendiente de calificación manual (ver "Evaluaciones pendientes").</Callout>
      )}

      <div>
        <Label htmlFor="q-points">Puntos</Label>
        <Input
          id="q-points"
          type="number"
          min="0"
          step="0.5"
          value={points}
          onChange={(e) => setPoints(e.target.value)}
          className="max-w-[6rem]"
        />
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancelar
        </Button>
        <Button size="sm" disabled={busy || !text.trim()} onClick={handleSubmit}>
          {busy ? "Guardando…" : "Agregar pregunta"}
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Docentes asignados a este curso (CourseStaff) — antes solo se podía
// asignar un docente editando prisma/seed.ts a mano; no había ningún
// endpoint ni pantalla para hacerlo. Solo ADMIN puede agregar/quitar (el
// docente del propio curso puede VER quién más está asignado, pero no
// modificarlo).
// ============================================================================

const STAFF_ROLE_LABEL: Record<string, string> = { TEACHER: "Docente", CO_TEACHER: "Co-docente", MODERATOR: "Moderador" };

function CourseStaffSection({ courseId }: { courseId: string }) {
  const { user } = useAuth();
  const isAdmin = user?.globalRole === "ADMIN";
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("TEACHER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Antes había que escribir el correo del docente de memoria (sin saber
  // siquiera si ya tenía cuenta) — ahora se elige de la lista real de
  // cuentas con rol Docente. El docente puede haberse registrado él mismo
  // (y el admin luego le cambia el rol en /admin/usuarios) o el admin puede
  // haberlo creado directamente ahí — cualquiera de los dos caminos termina
  // apareciendo en esta lista.
  useEffect(() => {
    if (!isAdmin) return;
    adminApi
      .users({ role: "TEACHER" })
      .then(setTeachers)
      .catch(() => setTeachers([]));
  }, [isAdmin]);

  async function refresh() {
    try {
      const data = await adminApi.courseStaff(courseId);
      setStaff(data);
    } catch {
      setStaff([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await adminApi.assignCourseStaff(courseId, { email: email.trim(), role });
      setEmail("");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos asignar al docente.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id: string) {
    if (!confirm("¿Quitar a este docente del curso?")) return;
    setBusy(true);
    try {
      await adminApi.removeCourseStaff(id);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos quitar al docente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <h2 className="font-serif text-lg font-semibold text-ink-900">Docentes asignados</h2>
        {error && <Callout variant="danger">{error}</Callout>}
        {loading ? (
          <p className="text-sm text-ash-500">Cargando…</p>
        ) : staff.length === 0 ? (
          <p className="text-sm text-ash-500">Todavía no hay ningún docente asignado a este curso.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {staff.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 rounded-md bg-paper-muted p-3 text-sm">
                <div>
                  <p className="font-medium text-ink-900">{s.userName}</p>
                  <p className="text-xs text-ash-500">
                    {s.userEmail} · {STAFF_ROLE_LABEL[s.role] ?? s.role}
                  </p>
                </div>
                {isAdmin && (
                  <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-bg" disabled={busy} onClick={() => handleRemove(s.id)}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {isAdmin && (
          <form onSubmit={handleAssign} className="flex flex-wrap items-end gap-2 border-t border-paper-border pt-4">
            <div className="flex-1">
              <Label htmlFor="staff-email">Docente</Label>
              <Select id="staff-email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11">
                <option value="">Selecciona un docente…</option>
                {teachers
                  .filter((t) => !staff.some((s) => s.userEmail === t.email && s.role === role))
                  .map((t) => (
                    <option key={t.id} value={t.email}>
                      {t.firstName} {t.lastName} ({t.email})
                    </option>
                  ))}
              </Select>
              {teachers.length === 0 && (
                <p className="mt-1 text-xs text-ash-500">
                  No hay ninguna cuenta con rol Docente todavía — créala en{" "}
                  <a href="/admin/usuarios" className="underline">
                    Usuarios y roles
                  </a>{" "}
                  (el docente también puede registrarse él mismo y luego le cambias el rol ahí).
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="staff-role">Rol</Label>
              <Select id="staff-role" value={role} onChange={(e) => setRole(e.target.value)} className="h-11">
                {Object.entries(STAFF_ROLE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" disabled={busy || !email.trim()}>
              + Asignar
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

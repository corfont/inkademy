"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, Trash2, Radio, ChevronUp, ChevronDown, Download, Eye } from "lucide-react";
import { adminApi, liveSessionApi, ApiError } from "@/lib/api-client";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
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

      <ApprovalRuleSection courseId={course.id} />

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
  const [priceCurrency, setPriceCurrency] = useState(course.priceCurrency ?? "PEN");
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
  // Solo aplica en la práctica a cursos grabados (el alumno avanza a su
  // ritmo, así que necesita una fecha límite o quedar abierto) — pero se
  // deja editable para cualquier modalidad, es el admin quien decide.
  const [accessDurationPolicy, setAccessDurationPolicy] = useState(course.accessDurationPolicy ?? "PERMANENT");
  const [blockMainVideoDownload, setBlockMainVideoDownload] = useState(course.blockMainVideoDownload ?? true);

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
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem_6rem]">
          <div>
            <Label htmlFor="edit-title">Título</Label>
            <Input id="edit-title" value={titleEs} onChange={(e) => setTitleEs(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="edit-price">Precio</Label>
            <Input id="edit-price" type="number" min="0" step="0.01" value={priceAmount} onChange={(e) => setPriceAmount(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="edit-currency">Moneda</Label>
            <Select id="edit-currency" value={priceCurrency} onChange={(e) => setPriceCurrency(e.target.value)}>
              <option value="PEN">PEN (S/)</option>
              <option value="USD">USD ($)</option>
            </Select>
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
        <div className="rounded-md bg-paper-muted p-3">
          <Label htmlFor="edit-access-policy">Plazo de acceso (cursos grabados)</Label>
          <Select id="edit-access-policy" value={accessDurationPolicy} onChange={(e) => setAccessDurationPolicy(e.target.value)}>
            <option value="PERMANENT">Abierto — sin fecha de término</option>
            <option value="DAYS_30">30 días desde la matrícula</option>
            <option value="MONTHS_6">6 meses desde la matrícula</option>
          </Select>
          <p className="mt-1 text-xs text-ash-500">
            Si tiene fecha de término, al vencer el alumno pierde el acceso al contenido y no recibe certificado — el admin puede ampliar el
            plazo de un alumno puntual desde /admin/matriculas.
          </p>
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
              Precio con descuento: {(Number(priceAmount) * (1 - Number(discountPercent) / 100)).toFixed(2)} {priceCurrency}
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
        <div className="rounded-md bg-paper-muted p-3">
          <label className="flex items-center gap-2 text-sm text-ink-900">
            <input type="checkbox" checked={blockMainVideoDownload} onChange={(e) => setBlockMainVideoDownload(e.target.checked)} />
            Bloquear la descarga del video principal
          </label>
          <p className="mt-1 text-xs text-ash-500">
            El alumno puede revisar la lección iniciadora cuantas veces quiera dentro de la plataforma, pero no descargarla. El material
            complementario siempre se puede descargar. Esto es un disuasivo razonable (sin botón/enlace de descarga, sin menú de clic derecho) —
            no es una protección anti-captura de pantalla real, que ningún navegador puede garantizar sin un sistema de DRM completo.
          </p>
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
                priceCurrency,
                certificateTemplateId: certificateTemplateId || null,
                language,
                areaId,
                durationHours: Number(durationHours),
                durationUnit,
                accessDurationPolicy,
                coverImageAssetId,
                syllabusAssetId,
                discountPercent: discountPercent ? Number(discountPercent) : null,
                discountExpiresAt: discountPercent && discountExpiresAt ? discountExpiresAt : null,
                blockMainVideoDownload,
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

      <p className="mt-3 text-[11px] text-ash-400">
        El alumno ve las lecciones (videos/PDF/texto) en el orden de esta lista — usa ↑/↓ para reordenarlas. Los materiales de cada lección se
        muestran igual: primero todos los <strong>Principales</strong> (para leer en ese momento, junto al video) y después los{" "}
        <strong>Complementarios</strong> (quedan disponibles pero no se resaltan) — dentro de cada grupo, en el orden que definas con sus propias
        flechas ↑/↓.
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {mod.lessons.map((lesson: any, i: number) => (
          <LessonRow
            key={lesson.id}
            lesson={lesson}
            busy={busy}
            run={run}
            isFirst={i === 0}
            isLast={i === mod.lessons.length - 1}
            onMove={(direction) => {
              const swapWith = mod.lessons[direction === "up" ? i - 1 : i + 1];
              if (!swapWith) return;
              run(async () => {
                await adminApi.updateLesson(lesson.id, { order: swapWith.order });
                await adminApi.updateLesson(swapWith.id, { order: lesson.order });
              });
            }}
          />
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

/**
 * Fila de material reutilizada tanto para materiales de módulo como de
 * lección — cambia categoría, visibilidad, orden, o elimina.
 *
 * "¿Cómo sabe el sistema cuál va primero?" — antes se ordenaban solo por
 * fecha de subida, sin forma de cambiarlo después. Las flechas ↑/↓ mueven
 * el material un puesto entre sus hermanos (misma lección o módulo);
 * Principal/Complementario es una agrupación aparte — todos los
 * Principales se muestran antes que los Complementarios, y este orden
 * decide la secuencia DENTRO de cada grupo.
 */
function MaterialItem({
  material,
  busy,
  run,
  isFirst,
  isLast,
}: {
  material: any;
  busy: boolean;
  run: (a: () => Promise<unknown>) => void;
  isFirst?: boolean;
  isLast?: boolean;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded bg-paper px-2 py-1 text-xs text-ash-600">
      <a href={material.assetUrl ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:underline">
        📎 {material.title}
      </a>
      <div className="flex items-center gap-2">
        <div className="flex items-center">
          <button
            type="button"
            className="px-1 text-ash-400 hover:text-ink-700 disabled:opacity-30"
            disabled={busy || isFirst}
            title="Mover arriba"
            aria-label="Mover material arriba"
            onClick={() => run(() => adminApi.reorderMaterial(material.id, "up"))}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="px-1 text-ash-400 hover:text-ink-700 disabled:opacity-30"
            disabled={busy || isLast}
            title="Mover abajo"
            aria-label="Mover material abajo"
            onClick={() => run(() => adminApi.reorderMaterial(material.id, "down"))}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
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
        {/* "Marcar si el material puede descargarse, visualizarse, o ambos"
            — se exige que al menos uno quede activo (el botón se
            deshabilita si apagarlo dejaría los dos en false). */}
        <button
          type="button"
          className={material.allowDownload !== false ? "text-ink-700" : "text-ash-300"}
          title={material.allowDownload !== false ? "Descarga permitida — click para bloquearla" : "Descarga bloqueada — click para permitirla"}
          disabled={busy || (material.allowDownload !== false && material.allowView === false)}
          onClick={() => run(() => adminApi.updateMaterial(material.id, { allowDownload: !(material.allowDownload !== false) }))}
        >
          <Download className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className={material.allowView !== false ? "text-ink-700" : "text-ash-300"}
          title={material.allowView !== false ? "Vista previa permitida — click para bloquearla" : "Vista previa bloqueada — click para permitirla"}
          disabled={busy || (material.allowView !== false && material.allowDownload === false)}
          onClick={() => run(() => adminApi.updateMaterial(material.id, { allowView: !(material.allowView !== false) }))}
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="text-ash-400 hover:text-danger"
          disabled={busy}
          title="Eliminar material"
          aria-label="Eliminar material"
          onClick={() => run(() => adminApi.deleteMaterial(material.id))}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </li>
  );
}

/**
 * Antes solo se podía subir un archivo — no había ninguna forma de agregar
 * un enlace externo (un video de YouTube, una página, un recurso ajeno) y,
 * si se intentaba forzarlo, no se guardaba nada visible ni para el alumno.
 * `onAdd` recibe (title, url) y crea el material con kind="link".
 */
function AddLinkControl({ onAdd, busy }: { onAdd: (title: string, url: string) => unknown; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
        + Agregar enlace
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input placeholder="Título del enlace" className="h-8 max-w-xs text-xs" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Input
        placeholder="https://…"
        type="url"
        className="h-8 max-w-xs text-xs"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <Button
        size="sm"
        disabled={saving || busy || !title.trim() || !url.trim()}
        onClick={async () => {
          setSaving(true);
          setError(null);
          try {
            await onAdd(title.trim(), url.trim());
            setTitle("");
            setUrl("");
            setOpen(false);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "No pudimos guardar el enlace — revisa que sea una URL válida (https://…).");
          } finally {
            setSaving(false);
          }
        }}
      >
        Guardar
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
        Cancelar
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
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
          {materials.map((m, i) => (
            <MaterialItem key={m.id} material={m} busy={busy} run={run} isFirst={i === 0} isLast={i === materials.length - 1} />
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
        <AddLinkControl
          busy={busy}
          onAdd={(linkTitle, url) => run(() => adminApi.createModuleMaterial(mod.id, { title: linkTitle, externalUrl: url, kind: "link", category }))}
        />
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

function LessonRow({
  lesson,
  busy,
  run,
  isFirst,
  isLast,
  onMove,
}: {
  lesson: any;
  busy: boolean;
  run: any;
  isFirst?: boolean;
  isLast?: boolean;
  onMove?: (direction: "up" | "down") => void;
}) {
  const router = useRouter();
  const [newMaterialTitle, setNewMaterialTitle] = useState("");
  const [newMaterialCategory, setNewMaterialCategory] = useState<"MAIN" | "SUPPLEMENTARY">("MAIN");
  const [uploading, setUploading] = useState(false);
  const [subtitlesRequesting, setSubtitlesRequesting] = useState(false);
  const [linkUrl, setLinkUrl] = useState(lesson.externalUrl ?? "");
  const [savingLink, setSavingLink] = useState(false);

  async function handleSaveLink() {
    setSavingLink(true);
    try {
      await adminApi.updateLesson(lesson.id, { externalUrl: linkUrl.trim() || null });
      router.refresh();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No pudimos guardar el enlace.");
    } finally {
      setSavingLink(false);
    }
  }

  async function handleGenerateSubtitles() {
    setSubtitlesRequesting(true);
    try {
      await adminApi.generateSubtitles(lesson.id);
      router.refresh();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No pudimos encolar la generación de subtítulos.");
    } finally {
      setSubtitlesRequesting(false);
    }
  }

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
          <div className="flex items-center">
            <button
              type="button"
              className="px-1 text-ash-400 hover:text-ink-700 disabled:opacity-30"
              disabled={busy || isFirst}
              title="Mover lección arriba"
              aria-label="Mover lección arriba"
              onClick={() => onMove?.("up")}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="px-1 text-ash-400 hover:text-ink-700 disabled:opacity-30"
              disabled={busy || isLast}
              title="Mover lección abajo"
              aria-label="Mover lección abajo"
              onClick={() => onMove?.("down")}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
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
      {lesson.contentType === "LINK" && (
        <div className="mt-2 flex items-center gap-2 text-xs text-ash-600">
          <Input
            className="h-8 max-w-md text-xs"
            placeholder="https://…"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
          />
          <Button size="sm" variant="outline" disabled={savingLink || linkUrl === (lesson.externalUrl ?? "")} onClick={handleSaveLink}>
            {savingLink ? "Guardando…" : "Guardar enlace"}
          </Button>
          {lesson.externalUrl && (
            <a href={lesson.externalUrl} target="_blank" rel="noreferrer" className="text-ink-700 hover:underline">
              Abrir ↗
            </a>
          )}
        </div>
      )}
      {lesson.contentType === "VIDEO" && lesson.videoAssetId && (
        <div className="mt-1.5 flex items-center gap-2 text-xs">
          {lesson.subtitlesStatus === "READY" ? (
            <span className="text-success">✓ Subtítulos generados</span>
          ) : lesson.subtitlesStatus === "PROCESSING" ? (
            <span className="text-ash-500">Generando subtítulos…</span>
          ) : lesson.subtitlesStatus === "FAILED" ? (
            <span className="text-danger" title={lesson.subtitlesError ?? ""}>
              No se pudieron generar (reintentar abajo)
            </span>
          ) : (
            <span className="text-ash-400">Sin subtítulos todavía</span>
          )}
          {lesson.subtitlesStatus !== "PROCESSING" && (
            <button
              type="button"
              className="font-medium text-ink-700 hover:underline disabled:opacity-50"
              disabled={subtitlesRequesting}
              onClick={handleGenerateSubtitles}
            >
              {subtitlesRequesting ? "Encolando…" : lesson.subtitlesStatus === "READY" ? "Regenerar" : "Generar subtítulos (IA)"}
            </button>
          )}
        </div>
      )}
      {(lesson.contentType === "VIDEO" || lesson.contentType === "TEXT") && (
        <label className="mt-2 flex items-center gap-1.5 text-xs text-ash-600" title="Al entrar al curso, el alumno ve esta lección de una vez, inline">
          <input
            type="checkbox"
            checked={Boolean(lesson.isCourseStarter)}
            disabled={busy}
            onChange={(e) => run(() => adminApi.updateLesson(lesson.id, { isCourseStarter: e.target.checked }))}
          />
          Esta lección inicia el curso (se muestra de una vez al entrar)
        </label>
      )}

      {lesson.materials?.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {lesson.materials.map((mat: any, i: number) => (
            <MaterialItem key={mat.id} material={mat} busy={busy} run={run} isFirst={i === 0} isLast={i === lesson.materials.length - 1} />
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
        <AddLinkControl
          busy={busy}
          onAdd={(linkTitle, url) =>
            run(() => adminApi.createMaterial(lesson.id, { title: linkTitle, externalUrl: url, kind: "link", category: newMaterialCategory }))
          }
        />
      </div>
      <p className="mt-1 text-[11px] text-ash-400">Acepta PDF, Word, Excel, PPT, imágenes (PNG/JPG), video, o un enlace externo.</p>
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
  const [form, setForm] = useState({ startsAt: "", endsAt: "", capacity: "", teacherId: "", recurrence: "ONCE" as "ONCE" | "WEEKLY" });
  const [teachers, setTeachers] = useState<any[]>([]);
  const [summary, setSummary] = useState<{ totalHours: number; scheduledHours: number; remainingHours: number } | null>(null);

  async function refreshSummary() {
    try {
      setSummary(await liveSessionApi.scheduleSummary(course.id));
    } catch {
      setSummary(null);
    }
  }

  useEffect(() => {
    adminApi
      .courseStaff(course.id)
      .then((rows) => setTeachers(rows.filter((r: any) => r.role === "TEACHER" || r.role === "CO_TEACHER")))
      .catch(() => setTeachers([]));
    refreshSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.id, course.liveSessions.length]);

  const durationMinutes = form.startsAt && form.endsAt ? (new Date(form.endsAt).getTime() - new Date(form.startsAt).getTime()) / 60000 : 0;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <h2 className="font-serif text-lg font-semibold text-ink-900">Sesiones en vivo</h2>

        {summary && (
          <div className="rounded-md bg-paper-muted p-3 text-sm">
            <p className="text-ink-900">
              <strong>{summary.scheduledHours}h</strong> programadas de <strong>{summary.totalHours}h</strong> del curso —{" "}
              {summary.remainingHours > 0 ? (
                <span className="text-ink-700">quedan {summary.remainingHours}h por programar</span>
              ) : (
                <span className="text-success">duración completa ya programada</span>
              )}
            </p>
          </div>
        )}

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
                    {session.teacherId && teachers.find((t) => t.userId === session.teacherId) && (
                      <> · {teachers.find((t) => t.userId === session.teacherId)?.userName}</>
                    )}
                  </p>
                </div>
              </div>
              {session.status !== "COMPLETED" && session.status !== "CANCELLED" && (
                <div className="flex items-center gap-1.5">
                  <RescheduleSessionControl sessionId={session.id} currentStartsAt={session.startsAt} currentEndsAt={session.endsAt} />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger hover:bg-danger-bg"
                    disabled={busy}
                    onClick={() => {
                      const reason = prompt("Motivo de la cancelación:");
                      if (reason) run(() => liveSessionApi.cancel(session.id, reason)).then(refreshSummary);
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>

        <div className="grid gap-3 border-t border-paper-border pt-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="session-teacher">Docente</Label>
            <Select id="session-teacher" value={form.teacherId} onChange={(e) => setForm((f) => ({ ...f, teacherId: e.target.value }))}>
              <option value="">Sin asignar</option>
              {teachers.map((t) => (
                <option key={t.userId} value={t.userId}>
                  {t.userName}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="session-recurrence">Repetición</Label>
            <Select
              id="session-recurrence"
              value={form.recurrence}
              onChange={(e) => setForm((f) => ({ ...f, recurrence: e.target.value as "ONCE" | "WEEKLY" }))}
            >
              <option value="ONCE">Una sola vez (u horario especial negociado)</option>
              <option value="WEEKLY">Repetir cada semana hasta completar la duración del curso</option>
            </Select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor="session-start">{form.recurrence === "WEEKLY" ? "Primera sesión — inicio" : "Inicio"}</Label>
            <Input
              id="session-start"
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="session-end">{form.recurrence === "WEEKLY" ? "Primera sesión — fin" : "Fin"}</Label>
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
        {form.recurrence === "WEEKLY" && durationMinutes > 0 && (
          <p className="text-xs text-ash-500">
            Se generarán sesiones semanales de {Math.round(durationMinutes)} minutos, mismo día/hora, hasta completar la duración del curso (la
            última se recorta si no calza exacto).
          </p>
        )}
        <div>
          <Button
            disabled={busy || !form.startsAt || !form.endsAt}
            onClick={async () => {
              const payload = {
                courseId: course.id,
                capacity: form.capacity ? Number(form.capacity) : undefined,
                teacherId: form.teacherId || undefined,
              };
              await run(() =>
                form.recurrence === "WEEKLY"
                  ? liveSessionApi.createSeries({
                      ...payload,
                      firstStartsAt: new Date(form.startsAt).toISOString(),
                      sessionDurationMinutes: Math.round(durationMinutes),
                    })
                  : liveSessionApi.create({
                      ...payload,
                      startsAt: new Date(form.startsAt).toISOString(),
                      endsAt: new Date(form.endsAt).toISOString(),
                    }),
              );
              setForm({ startsAt: "", endsAt: "", capacity: "", teacherId: form.teacherId, recurrence: form.recurrence });
              refreshSummary();
            }}
          >
            {form.recurrence === "WEEKLY" ? "Programar serie semanal (crea las reuniones de Teams)" : "Programar sesión (crea la reunión de Teams)"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Regla de habilitación de certificado (ApprovalRule) — antes solo se podía
 * crear editando prisma/seed.ts a mano, sin ninguna pantalla de admin. Un
 * curso sin evaluación puede dejar la nota mínima en 0 (o simplemente no
 * tener ninguna Assessment — el certificado no exige nota si el curso no
 * tiene evaluaciones, ver CertificateService.checkAndIssueIfEligible).
 */
function ApprovalRuleSection({ courseId }: { courseId: string }) {
  const [rule, setRule] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .approvalRule(courseId)
      .then(setRule)
      .catch(() => setRule({ minProgressPct: 100, minAttendancePct: null, minScore: 70, requiresAssignment: false, scoreMode: "BEST_ATTEMPT" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  if (!rule) return null;

  async function handleSave() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await adminApi.updateApprovalRule(courseId, {
        minProgressPct: Number(rule.minProgressPct),
        minAttendancePct: rule.minAttendancePct === "" || rule.minAttendancePct === null ? null : Number(rule.minAttendancePct),
        minScore: Number(rule.minScore),
        requiresAssignment: rule.requiresAssignment,
        scoreMode: rule.scoreMode ?? "BEST_ATTEMPT",
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar la regla.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <h2 className="font-serif text-lg font-semibold text-ink-900">Regla de habilitación de certificado</h2>
        <p className="text-sm text-ash-500">
          Qué debe cumplir el alumno para que el certificado se emita automáticamente. Si el curso no tiene ninguna evaluación, la nota mínima se
          ignora — solo se exige el % de avance (y asistencia, si aplica).
        </p>
        {error && <Callout variant="danger">{error}</Callout>}
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor={`ar-progress-${courseId}`}>% de avance mínimo</Label>
            <Input
              id={`ar-progress-${courseId}`}
              type="number"
              min="0"
              max="100"
              value={rule.minProgressPct}
              onChange={(e) => setRule((r: any) => ({ ...r, minProgressPct: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor={`ar-score-${courseId}`}>Nota mínima (solo si hay evaluación)</Label>
            <Input
              id={`ar-score-${courseId}`}
              type="number"
              min="0"
              max="100"
              value={rule.minScore}
              onChange={(e) => setRule((r: any) => ({ ...r, minScore: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor={`ar-attendance-${courseId}`}>% de asistencia mínima (opcional, solo cursos en vivo)</Label>
            <Input
              id={`ar-attendance-${courseId}`}
              type="number"
              min="0"
              max="100"
              value={rule.minAttendancePct ?? ""}
              placeholder="Sin exigir"
              onChange={(e) => setRule((r: any) => ({ ...r, minAttendancePct: e.target.value }))}
            />
          </div>
        </div>
        <div>
          <Label htmlFor={`ar-scoremode-${courseId}`}>Cómo se calcula la nota final</Label>
          <Select
            id={`ar-scoremode-${courseId}`}
            value={rule.scoreMode ?? "BEST_ATTEMPT"}
            onChange={(e) => setRule((r: any) => ({ ...r, scoreMode: e.target.value }))}
            className="max-w-sm"
          >
            <option value="BEST_ATTEMPT">Mejor nota entre todos los exámenes (por defecto)</option>
            <option value="WEIGHTED_AVERAGE">Promedio ponderado — cada examen pesa lo que le asignes abajo</option>
          </Select>
          {rule.scoreMode === "WEIGHTED_AVERAGE" && (
            <p className="mt-1 text-xs text-ash-500">
              Para diplomados con varios exámenes: asigna el % de peso de cada examen en la sección "Evaluaciones" más abajo. Un examen sin peso
              asignado no participa en el promedio. Si ningún examen tiene peso todavía, se usa "mejor nota" mientras armas la fórmula.
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-sm text-ash-600">
          <input
            type="checkbox"
            checked={rule.requiresAssignment}
            onChange={(e) => setRule((r: any) => ({ ...r, requiresAssignment: e.target.checked }))}
          />
          Exige al menos una tarea/pregunta abierta calificada como correcta
        </label>
        <div>
          <Button size="sm" variant="outline" disabled={busy} onClick={handleSave}>
            {busy ? "…" : saved ? "Guardado ✓" : "Guardar regla"}
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
  ORDERING: "Ordenar",
  SHORT_ANSWER: "Respuesta corta",
  OPEN: "Respuesta abierta (calificación manual)",
};

function AssessmentsSection({ courseId }: { courseId: string }) {
  const [assessments, setAssessments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  // "Módulo para crear evaluaciones O subir un archivo (Word/Excel/PPT/
  // imagen/PDF) como examen" — antes solo se podía crear evaluaciones por
  // preguntas; este toggle agrega la segunda modalidad, sin preguntas: el
  // docente sube el archivo del examen, el alumno lo descarga, lo responde
  // offline y sube su respuesta como otro archivo (ver AssessmentRunner).
  const [isFileUpload, setIsFileUpload] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

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

  async function handleCreateFileExam(file: File) {
    if (!newTitle.trim()) {
      alert("Ponle un título al examen antes de subir el archivo.");
      return;
    }
    setUploadingFile(true);
    try {
      const { assetId } = await adminApi.uploadAsset(file);
      await adminApi.createAssessment(courseId, { title: { es: newTitle }, sourceFileAssetId: assetId, sourceFileMimeType: file.type });
      setNewTitle("");
      setIsFileUpload(false);
      await refresh();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No pudimos crear el examen de archivo.");
    } finally {
      setUploadingFile(false);
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
            {(() => {
              const totalWeight = assessments.reduce((sum, a) => sum + (a.weightPercent ?? 0), 0);
              return (
                totalWeight > 0 && (
                  <Callout variant={Math.round(totalWeight) === 100 ? "info" : "warning"}>
                    Suma de pesos configurados: {totalWeight}%.{" "}
                    {Math.round(totalWeight) === 100
                      ? "Cuadra con la fórmula de promedio ponderado (activa el modo en la regla de habilitación de certificado, arriba)."
                      : "Para que el promedio ponderado tenga sentido, los pesos de los exámenes que participan en la fórmula deberían sumar 100%."}
                  </Callout>
                )
              );
            })()}
            {assessments.map((a) => (
              <AssessmentBlock key={a.id} assessment={a} onChange={refresh} />
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2 border-t border-paper-border pt-4">
          <div className="flex gap-2">
            <Input placeholder="Título de la nueva evaluación" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            {!isFileUpload && (
              <Button size="sm" disabled={creating || !newTitle.trim()} onClick={handleCreate}>
                + Nueva evaluación
              </Button>
            )}
          </div>
          <label className="flex items-center gap-2 text-xs text-ash-600">
            <input type="checkbox" checked={isFileUpload} onChange={(e) => setIsFileUpload(e.target.checked)} />
            Es un examen de archivo (el docente sube el examen en Word/Excel/PPT/imagen/PDF, en vez de escribir preguntas)
          </label>
          {isFileUpload && (
            <DropLabel
              busy={uploadingFile}
              label="Subir archivo del examen y crear"
              small
              onFile={handleCreateFileExam}
            />
          )}
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
  const [weightPercent, setWeightPercent] = useState(assessment.weightPercent != null ? String(assessment.weightPercent) : "");
  const [busy, setBusy] = useState(false);

  async function handleSaveRules() {
    setBusy(true);
    try {
      await adminApi.updateAssessment(assessment.id, {
        minScore: Number(minScore),
        maxAttempts: Number(maxAttempts),
        timeLimitMinutes: timeLimitMinutes ? Number(timeLimitMinutes) : undefined,
        displayMode,
        weightPercent: weightPercent.trim() === "" ? null : Number(weightPercent),
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

  const isFileUpload = Boolean(assessment.sourceFileAssetId);

  return (
    <div className="rounded-lg border border-paper-border p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-ink-900">
            {assessment.title?.es} {isFileUpload && <Badge variant="outline">Examen de archivo</Badge>}
          </p>
          <p className="text-xs text-ash-500">
            {isFileUpload
              ? `Sin preguntas — se califica el archivo completo que sube el alumno`
              : `${assessment.questions?.length ?? 0} pregunta${assessment.questions?.length === 1 ? "" : "s"}`}{" "}
            · {assessment._count?.attempts ?? 0} intento(s) de alumnos
            {assessment.weightPercent != null && ` · peso en fórmula: ${assessment.weightPercent}%`}
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
          <div className="grid gap-3 sm:grid-cols-4">
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
              <Label htmlFor={`weight-${assessment.id}`}>Peso en fórmula ponderada (%)</Label>
              <Input
                id={`weight-${assessment.id}`}
                type="number"
                min="0"
                max="100"
                placeholder="No participa"
                value={weightPercent}
                onChange={(e) => setWeightPercent(e.target.value)}
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

          {isFileUpload ? (
            <p className="rounded-md bg-paper-muted p-3 text-xs text-ash-600">
              Este examen no tiene preguntas — el alumno descarga el archivo que subiste, lo completa offline, y sube su respuesta como archivo
              para que lo califiques a mano en /docente/evaluaciones-pendientes.
            </p>
          ) : (
            <div className="flex flex-col gap-3 border-t border-paper-border pt-4">
              <h3 className="text-sm font-semibold text-ink-900">Preguntas</h3>
              {(assessment.questions ?? []).map((q: any) => (
                <QuestionRow key={q.id} question={q} onChange={onChange} />
              ))}
              <NewQuestionForm assessmentId={assessment.id} onChange={onChange} />
            </div>
          )}
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

  const needsOptions = type === "SINGLE_CHOICE" || type === "MULTI_CHOICE" || type === "ORDERING";
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
      } else if (type === "ORDERING") {
        // El orden en que el admin escribe las líneas ES el orden correcto —
        // al alumno se le presentan barajadas (ver AssessmentService.getForStudent).
        options = optionLines.map((line, i) => ({ id: `opt-${i}`, text: line }));
        correctAnswer = optionLines.map((_, i) => `opt-${i}`);
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
          <option value="ORDERING">Ordenar</option>
          <option value="SHORT_ANSWER">Respuesta corta</option>
          <option value="OPEN">Respuesta abierta (calificación manual)</option>
        </Select>
      </div>
      <div>
        <Label htmlFor="q-text">Pregunta</Label>
        <Input id="q-text" value={text} onChange={(e) => setText(e.target.value)} />
      </div>

      {type === "ORDERING" && (
        <div>
          <Label htmlFor="q-ordering-options">Opciones, en el ORDEN CORRECTO (una por línea)</Label>
          <textarea
            id="q-ordering-options"
            className="min-h-[5rem] w-full rounded-md border border-paper-border bg-paper p-2 text-sm"
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            placeholder={"Primer paso\nSegundo paso\nTercer paso"}
          />
          <p className="mt-1 text-xs text-ash-500">Al alumno se le muestran barajadas — tiene que reordenarlas hasta calzar con este orden.</p>
        </div>
      )}

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

      {needsOptions && type !== "ORDERING" && (
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
                <div className="flex items-center gap-2.5">
                  <Avatar name={s.userName} size="sm" />
                  <div>
                    <p className="font-medium text-ink-900">{s.userName}</p>
                    <p className="text-xs text-ash-500">
                      {s.userEmail} · {STAFF_ROLE_LABEL[s.role] ?? s.role}
                    </p>
                  </div>
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
              {(() => {
                // Antes, si el único docente disponible ya estaba asignado
                // con el rol elegido, el desplegable simplemente quedaba
                // vacío sin ninguna explicación — el admin veía "no aparece
                // ningún docente" y asumía que su cuenta estaba rota, cuando
                // en realidad ya estaba asignado (con ESE rol, en ESE curso).
                const available = teachers.filter((t) => !staff.some((s) => s.userEmail === t.email && s.role === role));
                return (
                  <>
                    <Select id="staff-email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11">
                      <option value="">Selecciona un docente…</option>
                      {available.map((t) => (
                        <option key={t.id} value={t.email}>
                          {t.firstName} {t.lastName} ({t.email})
                        </option>
                      ))}
                    </Select>
                    {teachers.length === 0 ? (
                      <p className="mt-1 text-xs text-ash-500">
                        No hay ninguna cuenta con rol Docente todavía — créala en{" "}
                        <a href="/admin/usuarios" className="underline">
                          Usuarios y roles
                        </a>{" "}
                        (el docente también puede registrarse él mismo y luego le cambias el rol ahí).
                      </p>
                    ) : (
                      available.length === 0 && (
                        <p className="mt-1 text-xs text-ash-500">
                          Los {teachers.length} docente{teachers.length === 1 ? "" : "s"} que existe{teachers.length === 1 ? "" : "n"} ya
                          está{teachers.length === 1 ? "" : "n"} asignado{teachers.length === 1 ? "" : "s"} a este curso con el rol
                          "{STAFF_ROLE_LABEL[role] ?? role}" — cambia el rol arriba, o crea otra cuenta de docente en{" "}
                          <a href="/admin/usuarios" className="underline">
                            Usuarios y roles
                          </a>
                          .
                        </p>
                      )
                    )}
                  </>
                );
              })()}
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

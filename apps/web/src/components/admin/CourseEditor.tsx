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

      <ContentSection course={course} busy={busy} run={run} />

      <LiveSessionsSection course={course} busy={busy} run={run} />
    </div>
  );
}

function StatusToggle({ status, busy, onChange }: { status: string; busy: boolean; onChange: (s: string) => void }) {
  const variant = status === "PUBLISHED" ? "success" : status === "ARCHIVED" ? "outline" : "neutral";
  const label = status === "PUBLISHED" ? "Publicado" : status === "ARCHIVED" ? "Archivado" : "Borrador";
  return (
    <div className="flex items-center gap-3">
      <Badge variant={variant as any}>{label}</Badge>
      {status !== "PUBLISHED" ? (
        <Button size="sm" disabled={busy} onClick={() => onChange("PUBLISHED")}>
          Publicar
        </Button>
      ) : (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onChange("DRAFT")}>
          Volver a borrador
        </Button>
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

  useEffect(() => {
    adminApi
      .certificateTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, []);

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

      <ul className="flex flex-col gap-2">
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

function LessonRow({ lesson, busy, run }: { lesson: any; busy: boolean; run: any }) {
  const router = useRouter();
  const [newMaterialTitle, setNewMaterialTitle] = useState("");
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
      await run(() => adminApi.createMaterial(lesson.id, { title: newMaterialTitle || file.name, assetId, kind: "pdf" }));
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
          <label className="flex cursor-pointer items-center gap-1 text-ink-700 hover:underline">
            <UploadCloud className="h-3.5 w-3.5" />
            {uploading ? "Subiendo…" : "Subir video"}
            <input
              type="file"
              accept="video/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => e.target.files?.[0] && handleVideoUpload(e.target.files[0])}
            />
          </label>
        </div>
      )}

      {lesson.materials?.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {lesson.materials.map((mat: any) => (
            <li key={mat.id} className="flex items-center justify-between text-xs text-ash-600">
              <span>📎 {mat.title}</span>
              <button type="button" className="text-ash-400 hover:text-danger" onClick={() => run(() => adminApi.deleteMaterial(mat.id))}>
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex items-center gap-2">
        <Input
          placeholder="Título del material (opcional)"
          className="h-8 max-w-xs text-xs"
          value={newMaterialTitle}
          onChange={(e) => setNewMaterialTitle(e.target.value)}
        />
        <label className="flex cursor-pointer items-center gap-1 text-xs text-ink-700 hover:underline">
          <UploadCloud className="h-3.5 w-3.5" />
          {uploading ? "Subiendo…" : "Agregar material"}
          <input
            type="file"
            className="hidden"
            disabled={uploading}
            onChange={(e) => e.target.files?.[0] && handleMaterialUpload(e.target.files[0])}
          />
        </label>
      </div>
    </li>
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

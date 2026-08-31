"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, FileText, HelpCircle, Eye, Download } from "lucide-react";
import { adminApi, ApiError } from "@/lib/api-client";
import { getClientAccessToken } from "@/lib/auth";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { DropLabel } from "./DropLabel";

interface ContentSlide {
  id: string;
  type: "content";
  title: string;
  body: string;
  imageUrl?: string | null;
}
interface QuestionSlide {
  id: string;
  type: "question";
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string | null;
}
type Slide = ContentSlide | QuestionSlide;

function newContentSlide(): ContentSlide {
  return { id: crypto.randomUUID(), type: "content", title: "", body: "" };
}
function newQuestionSlide(): QuestionSlide {
  return { id: crypto.randomUUID(), type: "question", question: "", options: ["", ""], correctIndex: 0 };
}

function SlideEditor({ slide, onChange, onDelete }: { slide: Slide; onChange: (next: Slide) => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [uploadingImage, setUploadingImage] = useState(false);

  async function handleImageUpload(file: File) {
    setUploadingImage(true);
    try {
      const { url } = await adminApi.uploadAsset(file);
      onChange({ ...(slide as ContentSlide), imageUrl: url });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No pudimos subir la imagen.");
    } finally {
      setUploadingImage(false);
    }
  }

  function updateOption(idx: number, value: string) {
    const q = slide as QuestionSlide;
    const options = q.options.map((o, i) => (i === idx ? value : o));
    onChange({ ...q, options });
  }
  function addOption() {
    const q = slide as QuestionSlide;
    if (q.options.length >= 6) return;
    onChange({ ...q, options: [...q.options, ""] });
  }
  function removeOption(idx: number) {
    const q = slide as QuestionSlide;
    if (q.options.length <= 2) return;
    const options = q.options.filter((_, i) => i !== idx);
    const correctIndex = q.correctIndex === idx ? 0 : q.correctIndex > idx ? q.correctIndex - 1 : q.correctIndex;
    onChange({ ...q, options, correctIndex });
  }

  return (
    <div ref={setNodeRef} style={style} className="flex gap-2 rounded-md border border-paper-border bg-paper p-3">
      <button type="button" className="mt-1 flex-none cursor-grab touch-none text-ash-400 hover:text-ash-600" aria-label="Arrastrar para reordenar" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="flex-1 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-medium text-ash-500">
            {slide.type === "content" ? <FileText className="h-3.5 w-3.5" aria-hidden="true" /> : <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />}
            {slide.type === "content" ? "Contenido" : "Pregunta"}
          </span>
          <button type="button" className="text-ash-400 hover:text-danger" onClick={onDelete} aria-label="Eliminar diapositiva">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {slide.type === "content" ? (
          <>
            <Input
              className="h-8 text-xs"
              placeholder="Título"
              value={slide.title}
              onChange={(e) => onChange({ ...slide, title: e.target.value })}
            />
            <Textarea
              className="text-xs"
              rows={3}
              placeholder="Texto de la diapositiva"
              value={slide.body}
              onChange={(e) => onChange({ ...slide, body: e.target.value })}
            />
            <div className="flex items-center gap-2 text-xs text-ash-600">
              {slide.imageUrl ? <span>Imagen cargada</span> : <span>Sin imagen (opcional)</span>}
              <DropLabel accept="image/*" busy={uploadingImage} label={slide.imageUrl ? "Reemplazar imagen" : "Subir imagen"} small onFile={handleImageUpload} />
            </div>
          </>
        ) : (
          <>
            <Textarea
              className="text-xs"
              rows={2}
              placeholder="Enunciado de la pregunta"
              value={slide.question}
              onChange={(e) => onChange({ ...slide, question: e.target.value })}
            />
            <div className="flex flex-col gap-1.5">
              {slide.options.map((opt, oIdx) => (
                <div key={oIdx} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`correct-${slide.id}`}
                    checked={slide.correctIndex === oIdx}
                    onChange={() => onChange({ ...slide, correctIndex: oIdx })}
                    title="Marcar como respuesta correcta"
                  />
                  <Input
                    className="h-7 flex-1 text-xs"
                    placeholder={`Opción ${oIdx + 1}`}
                    value={opt}
                    onChange={(e) => updateOption(oIdx, e.target.value)}
                  />
                  {slide.options.length > 2 && (
                    <button type="button" className="text-ash-400 hover:text-danger" onClick={() => removeOption(oIdx)} aria-label="Quitar opción">
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
              {slide.options.length < 6 && (
                <button type="button" className="self-start text-[11px] font-medium text-ink-700 hover:underline" onClick={addOption}>
                  + Agregar opción
                </button>
              )}
            </div>
            <Input
              className="h-7 text-xs"
              placeholder="Explicación al responder (opcional)"
              value={slide.explanation ?? ""}
              onChange={(e) => onChange({ ...slide, explanation: e.target.value || null })}
            />
          </>
        )}
      </div>
    </div>
  );
}

/**
 * "Me gustaría poder crear un paquete SCORM en este sistema" — editor de
 * autoría v1: diapositivas de Contenido/Pregunta en secuencia lineal, sin
 * ramificación condicional (fuera de alcance a propósito). Al guardar, el
 * backend genera un paquete SCORM 1.2 REAL (imsmanifest.xml + index.html)
 * y lo sube al mismo lugar que usaría subir un .zip a mano — el reproductor
 * del alumno (ScormPlayer en Classroom.tsx) no cambia nada para reproducirlo.
 */
export function ScormBuilder({ lesson, open, onClose, onSaved }: { lesson: any; open: boolean; onClose: () => void; onSaved: () => void }) {
  const router = useRouter();
  const existing = lesson.scormAuthoredContent as { slides: Slide[]; passingScore: number } | null;
  const [slides, setSlides] = useState<Slide[]>(existing?.slides?.length ? existing.slides : [newContentSlide()]);
  const [passingScore, setPassingScore] = useState(existing?.passingScore ?? 70);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [built, setBuilt] = useState(Boolean(lesson.scormEntryPath && lesson.scormAuthoredContent));
  const [previewLoading, setPreviewLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = slides.findIndex((s) => s.id === active.id);
    const newIndex = slides.findIndex((s) => s.id === over.id);
    setSlides(arrayMove(slides, oldIndex, newIndex));
  }

  function updateSlide(id: string, next: Slide) {
    setSlides((ss) => ss.map((s) => (s.id === id ? next : s)));
  }
  function deleteSlide(id: string) {
    setSlides((ss) => (ss.length > 1 ? ss.filter((s) => s.id !== id) : ss));
  }

  function validate(): string | null {
    if (slides.length === 0) return "Agrega al menos una diapositiva.";
    for (const s of slides) {
      if (s.type === "content" && (!s.title.trim() || !s.body.trim())) return "Cada diapositiva de contenido necesita título y texto.";
      if (s.type === "question" && (!s.question.trim() || s.options.some((o) => !o.trim()))) return "Cada pregunta necesita enunciado y todas sus opciones completas.";
    }
    return null;
  }

  async function handleSave() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await adminApi.buildScormPackage(lesson.id, { slides, passingScore });
      setBuilt(true);
      onSaved();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos generar el paquete SCORM.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePreview() {
    setPreviewLoading(true);
    try {
      const { playerUrl } = await adminApi.scormPreviewSession(lesson.id);
      window.open(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}${playerUrl}`, "_blank", "noopener,noreferrer");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No pudimos abrir la vista previa.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const token = getClientAccessToken();
      if (!token) throw new Error("Sesión inválida");
      await adminApi.downloadScormPackage(lesson.id, token);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No pudimos descargar el paquete.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Editor de contenido SCORM" className="max-h-[85vh] max-w-2xl overflow-y-auto">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-ash-500">
          Secuencia lineal de diapositivas (Siguiente/Atrás) — sin ramificación condicional. Al terminar, se califica según las
          preguntas de opción múltiple contra la nota mínima.
        </p>
        {error && <Callout variant="danger">{error}</Callout>}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={slides.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-2">
              {slides.map((s) => (
                <SlideEditor key={s.id} slide={s} onChange={(next) => updateSlide(s.id, next)} onDelete={() => deleteSlide(s.id)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setSlides((ss) => [...ss, newContentSlide()])}>
            + Contenido
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSlides((ss) => [...ss, newQuestionSlide()])}>
            + Pregunta
          </Button>
        </div>

        <div>
          <Label htmlFor="passing-score">Nota mínima para aprobar (%)</Label>
          <Input
            id="passing-score"
            type="number"
            min={0}
            max={100}
            className="w-28"
            value={passingScore}
            onChange={(e) => setPassingScore(Number(e.target.value))}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-paper-border pt-3">
          <Button disabled={saving} onClick={handleSave}>
            {saving ? "Generando…" : "Guardar y generar paquete"}
          </Button>
          {built && (
            <>
              <Button variant="outline" disabled={previewLoading} onClick={handlePreview} className="gap-1.5">
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                {previewLoading ? "Abriendo…" : "Vista previa"}
              </Button>
              <Button variant="outline" disabled={exporting} onClick={handleExport} className="gap-1.5">
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                {exporting ? "Descargando…" : "Descargar .zip"}
              </Button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Eye, Download, BarChart3 } from "lucide-react";
import {
  SCORM_SLIDE_TYPE_LABEL,
  SCORM_INTERACTION_TYPE_LABEL,
  buildScormContentHtml,
  type ScormSlide,
  type ScormAuthoredContent,
  type MatchingSlide,
  type OrderingSlide,
  type HotspotSlide,
  type HotspotZone,
} from "@inkademy/shared";
import { adminApi, ApiError } from "@/lib/api-client";
import { getClientAccessToken } from "@/lib/auth";
import { Dialog } from "@/components/ui/Dialog";
import { Input, Label, Textarea, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";
import { DropLabel } from "./DropLabel";

function uid(): string {
  return crypto.randomUUID();
}

const SLIDE_FACTORIES: Record<ScormSlide["type"], () => ScormSlide> = {
  content: () => ({ id: uid(), type: "content", title: "", body: "" }),
  true_false: () => ({ id: uid(), type: "true_false", question: "", correctAnswer: true }),
  single_choice: () => ({ id: uid(), type: "single_choice", question: "", options: ["", ""], correctIndex: 0 }),
  multiple_choice: () => ({ id: uid(), type: "multiple_choice", question: "", options: ["", ""], correctIndexes: [] }),
  fill_blank: () => ({ id: uid(), type: "fill_blank", text: "", blanks: [] }),
  matching: () => ({ id: uid(), type: "matching", pairs: [{ left: "", right: "" }, { left: "", right: "" }] }),
  ordering: () => ({ id: uid(), type: "ordering", items: ["", ""] }),
  hotspot: () => ({ id: uid(), type: "hotspot", question: "", imageUrl: "", zones: [] }),
};
const SLIDE_TYPES = Object.keys(SLIDE_FACTORIES) as ScormSlide["type"][];

// ============ Sub-editores por tipo ============

function OptionsEditor({
  options,
  correctSet,
  multi,
  onToggleCorrect,
  onChangeOption,
  onAddOption,
  onRemoveOption,
}: {
  options: string[];
  correctSet: Set<number>;
  multi: boolean;
  onToggleCorrect: (idx: number) => void;
  onChangeOption: (idx: number, value: string) => void;
  onAddOption: () => void;
  onRemoveOption: (idx: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {options.map((opt, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input
            type={multi ? "checkbox" : "radio"}
            checked={correctSet.has(idx)}
            onChange={() => onToggleCorrect(idx)}
            title="Marcar como respuesta correcta"
          />
          <Input className="h-7 flex-1 text-xs" placeholder={`Opción ${idx + 1}`} value={opt} onChange={(e) => onChangeOption(idx, e.target.value)} />
          {options.length > 2 && (
            <button type="button" className="text-ash-400 hover:text-danger" onClick={() => onRemoveOption(idx)} aria-label="Quitar opción">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
      {options.length < 6 && (
        <button type="button" className="self-start text-[11px] font-medium text-ink-700 hover:underline" onClick={onAddOption}>
          + Agregar opción
        </button>
      )}
    </div>
  );
}

function ExplanationField({ value, onChange }: { value: string | null | undefined; onChange: (v: string | null) => void }) {
  return (
    <Input className="h-7 text-xs" placeholder="Explicación al responder (opcional)" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} />
  );
}

function ContentSlideEditor({ slide, onChange }: { slide: Extract<ScormSlide, { type: "content" }>; onChange: (s: ScormSlide) => void }) {
  const [uploading, setUploading] = useState(false);
  async function handleImageUpload(file: File) {
    setUploading(true);
    try {
      // Data URI, no URL de storage: el contenido SCORM debe ser autocontenido y corre con una
      // CSP que no permite imágenes de otro origen (ver HotspotSlideEditor más abajo).
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      onChange({ ...slide, imageUrl: dataUrl });
    } catch {
      alert("No pudimos leer la imagen.");
    } finally {
      setUploading(false);
    }
  }
  return (
    <>
      <Input className="h-8 text-xs" placeholder="Título" value={slide.title} onChange={(e) => onChange({ ...slide, title: e.target.value })} />
      <Textarea className="text-xs" rows={3} placeholder="Texto de la diapositiva" value={slide.body} onChange={(e) => onChange({ ...slide, body: e.target.value })} />
      <div className="flex items-center gap-2 text-xs text-ash-600">
        {slide.imageUrl ? <span>Imagen cargada</span> : <span>Sin imagen (opcional)</span>}
        <DropLabel accept="image/*" busy={uploading} label={slide.imageUrl ? "Reemplazar imagen" : "Subir imagen"} small onFile={handleImageUpload} />
      </div>
    </>
  );
}

function TrueFalseSlideEditor({ slide, onChange }: { slide: Extract<ScormSlide, { type: "true_false" }>; onChange: (s: ScormSlide) => void }) {
  return (
    <>
      <Textarea className="text-xs" rows={2} placeholder="Enunciado" value={slide.question} onChange={(e) => onChange({ ...slide, question: e.target.value })} />
      <div className="flex gap-4 text-xs">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={slide.correctAnswer} onChange={() => onChange({ ...slide, correctAnswer: true })} /> Verdadero
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={!slide.correctAnswer} onChange={() => onChange({ ...slide, correctAnswer: false })} /> Falso
        </label>
      </div>
      <ExplanationField value={slide.explanation} onChange={(v) => onChange({ ...slide, explanation: v })} />
    </>
  );
}

function SingleChoiceSlideEditor({ slide, onChange }: { slide: Extract<ScormSlide, { type: "single_choice" }>; onChange: (s: ScormSlide) => void }) {
  return (
    <>
      <Textarea className="text-xs" rows={2} placeholder="Enunciado de la pregunta" value={slide.question} onChange={(e) => onChange({ ...slide, question: e.target.value })} />
      <OptionsEditor
        options={slide.options}
        correctSet={new Set([slide.correctIndex])}
        multi={false}
        onToggleCorrect={(idx) => onChange({ ...slide, correctIndex: idx })}
        onChangeOption={(idx, v) => onChange({ ...slide, options: slide.options.map((o, i) => (i === idx ? v : o)) })}
        onAddOption={() => onChange({ ...slide, options: [...slide.options, ""] })}
        onRemoveOption={(idx) => {
          const options = slide.options.filter((_, i) => i !== idx);
          const correctIndex = slide.correctIndex === idx ? 0 : slide.correctIndex > idx ? slide.correctIndex - 1 : slide.correctIndex;
          onChange({ ...slide, options, correctIndex });
        }}
      />
      <ExplanationField value={slide.explanation} onChange={(v) => onChange({ ...slide, explanation: v })} />
    </>
  );
}

function MultipleChoiceSlideEditor({ slide, onChange }: { slide: Extract<ScormSlide, { type: "multiple_choice" }>; onChange: (s: ScormSlide) => void }) {
  const correctSet = new Set(slide.correctIndexes);
  return (
    <>
      <Textarea className="text-xs" rows={2} placeholder="Enunciado (varias respuestas correctas)" value={slide.question} onChange={(e) => onChange({ ...slide, question: e.target.value })} />
      <OptionsEditor
        options={slide.options}
        correctSet={correctSet}
        multi
        onToggleCorrect={(idx) => {
          const next = new Set(correctSet);
          if (next.has(idx)) next.delete(idx);
          else next.add(idx);
          onChange({ ...slide, correctIndexes: Array.from(next).sort() });
        }}
        onChangeOption={(idx, v) => onChange({ ...slide, options: slide.options.map((o, i) => (i === idx ? v : o)) })}
        onAddOption={() => onChange({ ...slide, options: [...slide.options, ""] })}
        onRemoveOption={(idx) => {
          const options = slide.options.filter((_, i) => i !== idx);
          const correctIndexes = slide.correctIndexes.filter((c) => c !== idx).map((c) => (c > idx ? c - 1 : c));
          onChange({ ...slide, options, correctIndexes });
        }}
      />
      <ExplanationField value={slide.explanation} onChange={(v) => onChange({ ...slide, explanation: v })} />
    </>
  );
}

/** El admin escribe "___" donde va cada espacio — se cuentan y se piden las respuestas aceptadas por cada uno. */
function FillBlankSlideEditor({ slide, onChange }: { slide: Extract<ScormSlide, { type: "fill_blank" }>; onChange: (s: ScormSlide) => void }) {
  const blankCount = (slide.text.match(/___/g) || []).length;
  useEffect(() => {
    if (slide.blanks.length !== blankCount) {
      const next = Array.from({ length: blankCount }, (_, i) => slide.blanks[i] ?? []);
      onChange({ ...slide, blanks: next });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blankCount]);
  return (
    <>
      <Textarea
        className="text-xs"
        rows={2}
        placeholder="Escribe la frase usando ___ (tres guiones bajos) donde va cada espacio"
        value={slide.text}
        onChange={(e) => onChange({ ...slide, text: e.target.value })}
      />
      <p className="text-[11px] text-ash-500">{blankCount} espacio(s) detectado(s).</p>
      {slide.blanks.map((accepted, i) => (
        <Input
          key={i}
          className="h-7 text-xs"
          placeholder={`Espacio ${i + 1}: respuestas aceptadas separadas por coma`}
          value={accepted.join(", ")}
          onChange={(e) => {
            const blanks = slide.blanks.map((b, bi) => (bi === i ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean) : b));
            onChange({ ...slide, blanks });
          }}
        />
      ))}
      <ExplanationField value={slide.explanation} onChange={(v) => onChange({ ...slide, explanation: v })} />
    </>
  );
}

function MatchingSlideEditor({ slide, onChange }: { slide: MatchingSlide; onChange: (s: ScormSlide) => void }) {
  return (
    <>
      <Input className="h-7 text-xs" placeholder="Instrucciones (opcional)" value={slide.instructions ?? ""} onChange={(e) => onChange({ ...slide, instructions: e.target.value || null })} />
      <div className="flex flex-col gap-1.5">
        {slide.pairs.map((pair, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input className="h-7 flex-1 text-xs" placeholder="Elemento" value={pair.left} onChange={(e) => onChange({ ...slide, pairs: slide.pairs.map((p, i) => (i === idx ? { ...p, left: e.target.value } : p)) })} />
            <span className="text-ash-400">↔</span>
            <Input className="h-7 flex-1 text-xs" placeholder="Su pareja" value={pair.right} onChange={(e) => onChange({ ...slide, pairs: slide.pairs.map((p, i) => (i === idx ? { ...p, right: e.target.value } : p)) })} />
            {slide.pairs.length > 2 && (
              <button type="button" className="text-ash-400 hover:text-danger" onClick={() => onChange({ ...slide, pairs: slide.pairs.filter((_, i) => i !== idx) })} aria-label="Quitar par">
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
        {slide.pairs.length < 8 && (
          <button type="button" className="self-start text-[11px] font-medium text-ink-700 hover:underline" onClick={() => onChange({ ...slide, pairs: [...slide.pairs, { left: "", right: "" }] })}>
            + Agregar par
          </button>
        )}
      </div>
      <ExplanationField value={slide.explanation} onChange={(v) => onChange({ ...slide, explanation: v })} />
    </>
  );
}

function OrderingSlideEditor({ slide, onChange }: { slide: OrderingSlide; onChange: (s: ScormSlide) => void }) {
  return (
    <>
      <Input className="h-7 text-xs" placeholder="Instrucciones (opcional)" value={slide.instructions ?? ""} onChange={(e) => onChange({ ...slide, instructions: e.target.value || null })} />
      <p className="text-[11px] text-ash-500">Escribe los elementos en el ORDEN CORRECTO — se mostrarán desordenados al alumno.</p>
      <div className="flex flex-col gap-1.5">
        {slide.items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="w-4 text-xs text-ash-400">{idx + 1}.</span>
            <Input className="h-7 flex-1 text-xs" placeholder={`Elemento ${idx + 1}`} value={item} onChange={(e) => onChange({ ...slide, items: slide.items.map((it, i) => (i === idx ? e.target.value : it)) })} />
            {slide.items.length > 2 && (
              <button type="button" className="text-ash-400 hover:text-danger" onClick={() => onChange({ ...slide, items: slide.items.filter((_, i) => i !== idx) })} aria-label="Quitar elemento">
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
        {slide.items.length < 10 && (
          <button type="button" className="self-start text-[11px] font-medium text-ink-700 hover:underline" onClick={() => onChange({ ...slide, items: [...slide.items, ""] })}>
            + Agregar elemento
          </button>
        )}
      </div>
      <ExplanationField value={slide.explanation} onChange={(v) => onChange({ ...slide, explanation: v })} />
    </>
  );
}

/** Dibuja zonas correctas arrastrando sobre la imagen (coordenadas en % para que funcionen a cualquier tamaño). */
function HotspotSlideEditor({ slide, onChange }: { slide: HotspotSlide; onChange: (s: ScormSlide) => void }) {
  const [uploading, setUploading] = useState(false);
  const [drawing, setDrawing] = useState<{ startX: number; startY: number; x: number; y: number; width: number; height: number } | null>(null);

  async function handleImageUpload(file: File) {
    setUploading(true);
    try {
      // Se guarda como data URI (no una URL de storage): el paquete SCORM generado debe ser
      // autocontenido, y el contenido corre en un iframe con CSP "default-src 'self' ... data:"
      // que no permite cargar imágenes de otro origen (S3/CDN).
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      onChange({ ...slide, imageUrl: dataUrl, zones: [] });
    } catch {
      alert("No pudimos leer la imagen.");
    } finally {
      setUploading(false);
    }
  }

  function pctFromEvent(e: React.MouseEvent, rect: DOMRect) {
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100)),
    };
  }

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const { x, y } = pctFromEvent(e, rect);
    setDrawing({ startX: x, startY: y, x, y, width: 0, height: 0 });
  }
  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!drawing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const { x, y } = pctFromEvent(e, rect);
    const left = Math.min(drawing.startX, x);
    const top = Math.min(drawing.startY, y);
    setDrawing({ ...drawing, x: left, y: top, width: Math.abs(x - drawing.startX), height: Math.abs(y - drawing.startY) });
  }
  function handleMouseUp() {
    if (drawing && drawing.width > 1 && drawing.height > 1) {
      const zone: HotspotZone = { x: drawing.x, y: drawing.y, width: drawing.width, height: drawing.height };
      onChange({ ...slide, zones: [...slide.zones, zone] });
    }
    setDrawing(null);
  }

  return (
    <>
      <Textarea className="text-xs" rows={2} placeholder="Pregunta (¿dónde está...?)" value={slide.question} onChange={(e) => onChange({ ...slide, question: e.target.value })} />
      <div className="flex items-center gap-2 text-xs text-ash-600">
        {slide.imageUrl ? <span>Imagen cargada</span> : <span>Sube una imagen primero</span>}
        <DropLabel accept="image/*" busy={uploading} label={slide.imageUrl ? "Reemplazar imagen" : "Subir imagen"} small onFile={handleImageUpload} />
      </div>
      {slide.imageUrl && (
        <>
          <p className="text-[11px] text-ash-500">Arrastra sobre la imagen para marcar una zona correcta. Puedes marcar varias.</p>
          <div
            className="relative inline-block max-w-full cursor-crosshair select-none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => setDrawing(null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={slide.imageUrl} alt="" className="max-w-full rounded-md" draggable={false} />
            {slide.zones.map((z, idx) => (
              <div
                key={idx}
                className="absolute rounded border-2 border-success bg-success/20"
                style={{ left: `${z.x}%`, top: `${z.y}%`, width: `${z.width}%`, height: `${z.height}%` }}
              >
                <button
                  type="button"
                  className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-xs text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange({ ...slide, zones: slide.zones.filter((_, i) => i !== idx) });
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            {drawing && (
              <div
                className="pointer-events-none absolute rounded border-2 border-dashed border-ink-700 bg-ink-700/10"
                style={{ left: `${drawing.x}%`, top: `${drawing.y}%`, width: `${drawing.width}%`, height: `${drawing.height}%` }}
              />
            )}
          </div>
        </>
      )}
      <ExplanationField value={slide.explanation} onChange={(v) => onChange({ ...slide, explanation: v })} />
    </>
  );
}

function SlideTypeEditor({ slide, onChange }: { slide: ScormSlide; onChange: (s: ScormSlide) => void }) {
  switch (slide.type) {
    case "content":
      return <ContentSlideEditor slide={slide} onChange={onChange} />;
    case "true_false":
      return <TrueFalseSlideEditor slide={slide} onChange={onChange} />;
    case "single_choice":
      return <SingleChoiceSlideEditor slide={slide} onChange={onChange} />;
    case "multiple_choice":
      return <MultipleChoiceSlideEditor slide={slide} onChange={onChange} />;
    case "fill_blank":
      return <FillBlankSlideEditor slide={slide} onChange={onChange} />;
    case "matching":
      return <MatchingSlideEditor slide={slide} onChange={onChange} />;
    case "ordering":
      return <OrderingSlideEditor slide={slide} onChange={onChange} />;
    case "hotspot":
      return <HotspotSlideEditor slide={slide} onChange={onChange} />;
  }
}

function SlideRow({ slide, onChange, onDelete }: { slide: ScormSlide; onChange: (next: ScormSlide) => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="flex gap-2 rounded-md border border-paper-border bg-paper p-3">
      <button type="button" className="mt-1 flex-none cursor-grab touch-none text-ash-400 hover:text-ash-600" aria-label="Arrastrar para reordenar" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-ash-500">{SCORM_SLIDE_TYPE_LABEL[slide.type]}</span>
          <button type="button" className="text-ash-400 hover:text-danger" onClick={onDelete} aria-label="Eliminar diapositiva">
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <SlideTypeEditor slide={slide} onChange={onChange} />
      </div>
    </div>
  );
}

interface ScormAnalytics {
  totalAttempts: number;
  completedCount: number;
  completionRate: number;
  averageScore: number | null;
  perQuestion: { id: string; type: string; correct: number; total: number; correctRate: number }[];
}

/**
 * "Que no le falte nada comparado con Articulate/iSpring" — editor v2: 8
 * tipos de diapositiva (7 de pregunta/interacción + Contenido, dos con
 * arrastre real), vista previa EN VIVO (sin guardar primero — el mismo
 * generador de @inkademy/shared corre acá mismo en un <iframe srcDoc>,
 * findAPI() no encuentra ningún SCORM API ahí y sigue funcionando igual),
 * y analítica por pregunta una vez que ya hay intentos reales.
 */
export function ScormBuilder({ lesson, open, onClose, onSaved }: { lesson: any; open: boolean; onClose: () => void; onSaved: () => void }) {
  const router = useRouter();
  const existing = lesson.scormAuthoredContent as ScormAuthoredContent | null;
  const [slides, setSlides] = useState<ScormSlide[]>(existing?.slides?.length ? existing.slides : [SLIDE_FACTORIES.content()]);
  const [passingScore, setPassingScore] = useState(existing?.passingScore ?? 70);
  const [addType, setAddType] = useState<ScormSlide["type"]>("content");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [built, setBuilt] = useState(Boolean(lesson.scormEntryPath && lesson.scormAuthoredContent));
  const [previewLoading, setPreviewLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [analytics, setAnalytics] = useState<ScormAnalytics | null>(null);

  useEffect(() => {
    if (!built) return;
    adminApi.scormAnalytics(lesson.id).then(setAnalytics).catch(() => setAnalytics(null));
  }, [built, lesson.id]);

  const previewHtml = useMemo(() => {
    try {
      return buildScormContentHtml({ slides, passingScore }, "Vista previa");
    } catch {
      return null;
    }
  }, [slides, passingScore]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = slides.findIndex((s) => s.id === active.id);
    const newIndex = slides.findIndex((s) => s.id === over.id);
    setSlides(arrayMove(slides, oldIndex, newIndex));
  }

  function updateSlide(id: string, next: ScormSlide) {
    setSlides((ss) => ss.map((s) => (s.id === id ? next : s)));
  }
  function deleteSlide(id: string) {
    setSlides((ss) => (ss.length > 1 ? ss.filter((s) => s.id !== id) : ss));
  }

  function validate(): string | null {
    for (const s of slides) {
      if (s.type === "content" && (!s.title.trim() || !s.body.trim())) return "Cada diapositiva de Contenido necesita título y texto.";
      if ((s.type === "true_false" || s.type === "single_choice" || s.type === "multiple_choice") && !s.question.trim()) return "Cada pregunta necesita su enunciado.";
      if (s.type === "fill_blank" && !s.text.trim()) return "Completar espacio necesita su frase.";
      if ((s.type === "single_choice" || s.type === "multiple_choice") && s.options.some((o) => !o.trim())) return "Completa todas las opciones.";
      if (s.type === "multiple_choice" && s.correctIndexes.length === 0) return "Marca al menos una respuesta correcta en cada Opción múltiple.";
      if (s.type === "fill_blank" && (s.blanks.length === 0 || s.blanks.some((b) => b.length === 0))) return "Define las respuestas aceptadas de cada espacio.";
      if (s.type === "matching" && s.pairs.some((p) => !p.left.trim() || !p.right.trim())) return "Completa ambos lados de cada par en Emparejar.";
      if (s.type === "ordering" && s.items.some((i) => !i.trim())) return "Completa todos los elementos de Ordenar.";
      if (s.type === "hotspot" && (!s.imageUrl || s.zones.length === 0)) return "Punto caliente necesita una imagen y al menos una zona marcada.";
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

  async function handlePreviewSession() {
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
    <Dialog open={open} onClose={onClose} title="Editor de contenido SCORM" className="max-h-[90vh] max-w-5xl overflow-y-auto">
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          <p className="text-xs text-ash-500">
            Secuencia lineal (Siguiente/Atrás) — sin ramificación condicional. Al terminar se califica según las preguntas contra la nota mínima.
          </p>
          {error && <Callout variant="danger">{error}</Callout>}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={slides.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {slides.map((s) => (
                  <SlideRow key={s.id} slide={s} onChange={(next) => updateSlide(s.id, next)} onDelete={() => deleteSlide(s.id)} />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <div className="flex flex-wrap items-center gap-2">
            <Select className="h-8 w-48 text-xs" value={addType} onChange={(e) => setAddType(e.target.value as ScormSlide["type"])}>
              {SLIDE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SCORM_SLIDE_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="outline" onClick={() => setSlides((ss) => [...ss, SLIDE_FACTORIES[addType]()])}>
              + Agregar diapositiva
            </Button>
          </div>

          <div>
            <Label htmlFor="passing-score">Nota mínima para aprobar (%)</Label>
            <Input id="passing-score" type="number" min={0} max={100} className="w-28" value={passingScore} onChange={(e) => setPassingScore(Number(e.target.value))} />
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-paper-border pt-3">
            <Button disabled={saving} onClick={handleSave}>
              {saving ? "Generando…" : "Guardar y generar paquete"}
            </Button>
            {built && (
              <>
                <Button variant="outline" disabled={previewLoading} onClick={handlePreviewSession} className="gap-1.5">
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  {previewLoading ? "Abriendo…" : "Probar paquete generado"}
                </Button>
                <Button variant="outline" disabled={exporting} onClick={handleExport} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  {exporting ? "Descargando…" : "Descargar .zip"}
                </Button>
              </>
            )}
          </div>

          {analytics && analytics.totalAttempts > 0 && (
            <Card>
              <CardContent className="flex flex-col gap-3 p-4">
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
                  <BarChart3 className="h-4 w-4 text-indigo-600" aria-hidden="true" />
                  Analítica ({analytics.totalAttempts} intento{analytics.totalAttempts === 1 ? "" : "s"})
                </h3>
                <p className="text-xs text-ash-600">
                  {analytics.completionRate}% finalización · promedio {analytics.averageScore ?? "—"}%
                </p>
                <ul className="flex flex-col gap-1 text-xs text-ash-700">
                  {analytics.perQuestion.map((q, i) => (
                    <li key={q.id} className="flex items-center justify-between">
                      <span>Pregunta {i + 1} ({SCORM_INTERACTION_TYPE_LABEL[q.type] ?? q.type})</span>
                      <span className={q.correctRate < 50 ? "font-semibold text-danger" : "text-ash-600"}>{q.correctRate}% aciertos</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-ash-500">Vista previa en vivo</p>
          <iframe
            title="Vista previa en vivo"
            srcDoc={previewHtml ?? ""}
            className="h-[560px] w-full rounded-lg border border-paper-border bg-ink-950"
            sandbox="allow-scripts"
          />
        </div>
      </div>
    </Dialog>
  );
}

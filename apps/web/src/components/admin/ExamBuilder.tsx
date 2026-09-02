"use client";

import { useEffect, useRef, useState } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Pencil, Eye, Archive, ArchiveRestore, X } from "lucide-react";
import { adminApi, ApiError } from "@/lib/api-client";
import { Dialog } from "@/components/ui/Dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { BRAND_FONT_OPTIONS } from "@/lib/brand-fonts";
import { ExamHeaderCard } from "@/components/campus/ExamHeaderCard";
import { cn } from "@/lib/cn";

const QUESTION_TYPE_LABEL: Record<string, string> = {
  SINGLE_CHOICE: "Opción única",
  MULTI_CHOICE: "Opción múltiple",
  TRUE_FALSE: "Verdadero/Falso",
  ORDERING: "Ordenar",
  SHORT_ANSWER: "Respuesta corta",
  OPEN: "Respuesta abierta (calificación manual)",
};

/** Deriva el índice/índices marcados como correctos de una pregunta ya guardada, para precargar el formulario en modo edición. */
function deriveInitialCorrect(q: any): { correctIndex: number; correctIndexes: number[] } {
  if (!q) return { correctIndex: 0, correctIndexes: [] };
  const opts = q.options ?? [];
  if (q.type === "TRUE_FALSE") return { correctIndex: q.correctAnswer === "false" ? 1 : 0, correctIndexes: [] };
  if (q.type === "SINGLE_CHOICE") {
    const idx = opts.findIndex((o: any) => o.id === q.correctAnswer);
    return { correctIndex: idx >= 0 ? idx : 0, correctIndexes: [] };
  }
  if (q.type === "MULTI_CHOICE") {
    const answers: string[] = Array.isArray(q.correctAnswer) ? q.correctAnswer : [];
    const idxs = answers.map((a) => opts.findIndex((o: any) => o.id === a)).filter((i) => i >= 0);
    return { correctIndex: 0, correctIndexes: idxs };
  }
  return { correctIndex: 0, correctIndexes: [] };
}

/**
 * Generalización de lo que antes era "NewQuestionForm" (solo creaba) — con
 * `existingQuestion` precarga y guarda con `updateQuestion` en vez de
 * `createQuestion`. La corrección automática (marcar la respuesta correcta
 * al crear la pregunta) es exactamente la misma de siempre, solo que ahora
 * también sirve para editar.
 */
function QuestionForm({
  assessmentId,
  existingQuestion,
  onDone,
  onCancel,
}: {
  assessmentId: string;
  existingQuestion?: any;
  onDone: () => void;
  onCancel: () => void;
}) {
  const isEdit = Boolean(existingQuestion);
  const initialCorrect = deriveInitialCorrect(existingQuestion);
  const [type, setType] = useState(existingQuestion?.type ?? "SINGLE_CHOICE");
  const [text, setText] = useState(existingQuestion?.text?.es ?? "");
  const [optionsText, setOptionsText] = useState<string>(
    existingQuestion?.options?.length ? existingQuestion.options.map((o: any) => o.text).join("\n") : "",
  );
  const [correctIndex, setCorrectIndex] = useState(initialCorrect.correctIndex);
  const [correctIndexes, setCorrectIndexes] = useState<number[]>(initialCorrect.correctIndexes);
  const [shortAnswer, setShortAnswer] = useState(existingQuestion?.type === "SHORT_ANSWER" ? (existingQuestion?.correctAnswer ?? "") : "");
  const [points, setPoints] = useState(String(existingQuestion?.points ?? 1));
  const [busy, setBusy] = useState(false);

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
        // El orden en que el admin escribe las líneas ES el orden correcto.
        options = optionLines.map((line, i) => ({ id: `opt-${i}`, text: line }));
        correctAnswer = optionLines.map((_, i) => `opt-${i}`);
      } else if (needsOptions) {
        options = optionLines.map((line, i) => ({ id: `opt-${i}`, text: line }));
        correctAnswer = type === "SINGLE_CHOICE" ? `opt-${correctIndex}` : correctIndexes.map((i) => `opt-${i}`);
      } else if (type === "SHORT_ANSWER") {
        correctAnswer = shortAnswer;
      }

      const payload = { type, text: { es: text }, options, correctAnswer, points: Number(points) || 1 };
      if (isEdit) {
        await adminApi.updateQuestion(existingQuestion.id, payload);
      } else {
        await adminApi.createQuestion(assessmentId, payload);
      }
      onDone();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No pudimos guardar la pregunta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-paper-border p-4">
      <div>
        <Label htmlFor="q-type">Tipo de pregunta</Label>
        <Select
          id="q-type"
          value={type}
          disabled={isEdit}
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
        {isEdit && <p className="mt-1 text-xs text-ash-500">El tipo no se puede cambiar al editar — elimina y crea una nueva si necesitas otro tipo.</p>}
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
                    <input type="radio" checked={correctIndex === i} onChange={() => setCorrectIndex(i)} /> {line}
                  </label>
                ) : (
                  <label key={i} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={correctIndexes.includes(i)}
                      onChange={(e) =>
                        setCorrectIndexes((prev) => (e.target.checked ? [...prev, i] : prev.filter((x) => x !== i)))
                      }
                    />{" "}
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
          <Label htmlFor="q-short-answer">Respuesta correcta (coincidencia exacta, sin distinguir mayúsculas)</Label>
          <Input id="q-short-answer" value={shortAnswer} onChange={(e) => setShortAnswer(e.target.value)} />
        </div>
      )}

      {type === "OPEN" && (
        <Callout variant="info">Esta pregunta se califica a mano — no requiere marcar una respuesta correcta.</Callout>
      )}

      <div>
        <Label htmlFor="q-points">Puntos</Label>
        <Input id="q-points" type="number" min="0.1" step="0.1" value={points} onChange={(e) => setPoints(e.target.value)} className="max-w-[8rem]" />
      </div>

      <div className="flex gap-2">
        <Button size="sm" disabled={busy || !text.trim()} onClick={handleSubmit}>
          {busy ? "Guardando…" : isEdit ? "Guardar cambios" : "Agregar pregunta"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function SortableQuestionRow({
  question,
  editing,
  onEdit,
  onCancelEdit,
  onDelete,
  onSaved,
}: {
  question: any;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onSaved: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: question.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  if (editing) {
    return (
      <div ref={setNodeRef} style={style}>
        <QuestionForm assessmentId={question.assessmentId} existingQuestion={question} onDone={onSaved} onCancel={onCancelEdit} />
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-start justify-between gap-3 rounded-md bg-paper-muted p-3 text-sm">
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="mt-0.5 cursor-grab touch-none text-ash-400 hover:text-ash-600"
          aria-label="Arrastrar para reordenar"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
        <div>
          <p className="text-ink-900">{question.text?.es}</p>
          <p className="text-xs text-ash-500">
            {QUESTION_TYPE_LABEL[question.type] ?? question.type} · {question.points} pto(s)
            {question.options?.length ? ` · ${question.options.length} opciones` : ""}
          </p>
        </div>
      </div>
      <div className="flex flex-none gap-1">
        <Button size="sm" variant="ghost" onClick={onEdit} aria-label="Editar pregunta">
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-bg" onClick={onDelete} aria-label="Eliminar pregunta">
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

/**
 * "Reestructura tipo drag and drop, botón de previsualizar, tipos de letra,
 * logo, datos del curso, duración, intentos" — reemplaza el antiguo panel
 * "Gestionar" embebido en la fila del examen. Un solo modal con: reglas,
 * cabecera/pie/instrucciones (heredadas del curso u override propio),
 * preguntas reordenables por drag-and-drop, y vista previa.
 */
export function ExamBuilder({
  assessment,
  course,
  otherWeightsSum,
  onClose,
  onChange,
}: {
  assessment: any;
  course: any;
  otherWeightsSum: number;
  onClose: () => void;
  onChange: () => void;
}) {
  const [questions, setQuestions] = useState<any[]>(assessment.questions ?? []);
  // El padre (AssessmentsSection) vuelve a pedir la lista completa después
  // de cada mutación (onChange -> refresh) y nos pasa un `assessment`
  // nuevo — sin esto, la fila de una pregunta recién editada seguía
  // mostrando el texto viejo porque este estado local solo se inicializaba
  // una vez, al montar.
  useEffect(() => {
    setQuestions(assessment.questions ?? []);
  }, [assessment.questions]);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; errors: { row: number; message: string }[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [minScore, setMinScore] = useState(String(assessment.minScore));
  const [maxAttempts, setMaxAttempts] = useState(String(assessment.maxAttempts));
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(assessment.timeLimitMinutes ? String(assessment.timeLimitMinutes) : "");
  const [displayMode, setDisplayMode] = useState(assessment.displayMode ?? "ALL_AT_ONCE");
  const [weightPercent, setWeightPercent] = useState(assessment.weightPercent != null ? String(assessment.weightPercent) : "");
  const [titleFontFamily, setTitleFontFamily] = useState(assessment.titleFontFamily ?? "");
  // "¿Cómo sabe cuál examen tomar en cada módulo?" — vacío = examen final
  // del curso (exige el curso completo); con valor, se desbloquea apenas
  // ESE módulo se completa.
  const [moduleId, setModuleId] = useState(assessment.moduleId ?? "");

  const [useCourseHeader, setUseCourseHeader] = useState(assessment.headerTextOverride == null);
  const [headerText, setHeaderText] = useState(assessment.headerTextOverride?.es ?? "");
  const [useCourseFooter, setUseCourseFooter] = useState(assessment.footerTextOverride == null);
  const [footerText, setFooterText] = useState(assessment.footerTextOverride?.es ?? "");
  const [useCourseInstructions, setUseCourseInstructions] = useState(assessment.instructionsOverride == null);
  const [instructionsText, setInstructionsText] = useState(assessment.instructionsOverride?.es ?? "");

  const isFileUpload = Boolean(assessment.sourceFileAssetId);
  // "¿Cómo se calcula la nota si el examen vive DENTRO del SCORM?" — este
  // examen no tiene preguntas propias, su nota la reporta el paquete SCORM
  // de una lección/material (ver Assessment.scormLessonId/scormMaterialId).
  const isScormBacked = Boolean(assessment.scormLessonId || assessment.scormMaterialId);
  const scormBackedLabel = assessment.scormLessonId ? assessment.scormLesson?.title?.es : assessment.scormMaterial?.title;
  const maxWeight = Math.max(0, 100 - otherWeightsSum);
  const weightNum = weightPercent.trim() === "" ? 0 : Number(weightPercent);
  const weightOverLimit = weightNum > maxWeight + 0.01;

  // "Si al grabar las preguntas el puntaje excede la nota máxima debe
  // aparecer una alerta para que el docente lo actualice, sino no va a
  // poder usar ese examen en una evaluación" — la nota final SIEMPRE se
  // normaliza sobre 100 (ver submitAttempt/gradeFileAttempt: earned/maxPoints
  // *100), así que matemáticamente el examen funciona igual aunque los
  // puntos sumen 137 — pero es justamente esa mezcla la que puede confundir
  // al docente sobre cuánto vale cada pregunta. Se avisa acá Y se bloquea
  // en el backend (createAttempt) hasta que la suma sea ≤100.
  const totalPoints = questions.reduce((sum, q) => sum + (q.points ?? 0), 0);
  const pointsOverLimit = totalPoints > 100.01;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function handleSaveRules() {
    setBusy(true);
    setError(null);
    try {
      await adminApi.updateAssessment(assessment.id, {
        minScore: Number(minScore),
        maxAttempts: Number(maxAttempts),
        timeLimitMinutes: timeLimitMinutes ? Number(timeLimitMinutes) : null,
        displayMode,
        weightPercent: weightPercent.trim() === "" ? null : Number(weightPercent),
        titleFontFamily: titleFontFamily || null,
        moduleId: moduleId || null,
        headerTextOverride: useCourseHeader ? null : { es: headerText },
        footerTextOverride: useCourseFooter ? null : { es: footerText },
        instructionsOverride: useCourseInstructions ? null : { es: instructionsText },
      });
      onChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos guardar las reglas.");
    } finally {
      setBusy(false);
    }
  }

  async function handleArchiveToggle() {
    setBusy(true);
    try {
      await adminApi.updateAssessment(assessment.id, { archived: !assessment.archived });
      onChange();
      onClose();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No pudimos actualizar el estado.");
    } finally {
      setBusy(false);
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo tras corregirlo
    if (!file) return;
    setImportBusy(true);
    setImportResult(null);
    try {
      const result = await adminApi.importQuestions(assessment.id, file);
      setImportResult(result);
      if (result.created > 0) onChange();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No pudimos importar el archivo.");
    } finally {
      setImportBusy(false);
    }
  }

  async function handleDeleteQuestion(id: string) {
    if (!confirm("¿Eliminar esta pregunta?")) return;
    try {
      await adminApi.deleteQuestion(id);
      setQuestions((qs) => qs.filter((q) => q.id !== id));
      onChange();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No pudimos eliminar la pregunta.");
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = questions.findIndex((q) => q.id === active.id);
    const newIndex = questions.findIndex((q) => q.id === over.id);
    const next = arrayMove(questions, oldIndex, newIndex);
    setQuestions(next);
    try {
      await adminApi.reorderQuestions(assessment.id, next.map((q) => q.id));
      onChange();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "No pudimos guardar el nuevo orden.");
      setQuestions(assessment.questions ?? []);
    }
  }

  const previewInfo = {
    courseTitle: course.title,
    title: assessment.title,
    titleFontFamily: titleFontFamily || null,
    timeLimitMinutes: timeLimitMinutes ? Number(timeLimitMinutes) : null,
    maxAttempts: Number(maxAttempts) || null,
    minScore: minScore ? Number(minScore) : null,
    availableFrom: assessment.availableFrom,
    availableUntil: assessment.availableUntil,
    headerText: useCourseHeader ? course.examHeaderText : { es: headerText },
    footerText: useCourseFooter ? course.examFooterText : { es: footerText },
    instructionsText: useCourseInstructions ? course.examInstructionsText : { es: instructionsText },
  };

  const saveButton = (
    <Button size="sm" variant="outline" disabled={busy || weightOverLimit} onClick={handleSaveRules} className="self-start">
      {busy ? "Guardando…" : "Guardar cambios"}
    </Button>
  );

  return (
    <Dialog open onClose={onClose} title={assessment.title?.es ?? "Examen"} className="max-h-[85vh] max-w-3xl overflow-y-auto">
      <div className="flex flex-col gap-4">
        {error && <Callout variant="danger">{error}</Callout>}

        {/* "Es muy complicado... revísalo y mejóralo" — antes esto era UNA
            sola columna larga (reglas + cabecera/pie + preguntas, todo
            junto): había que bajar por ~6 campos antes de llegar a
            "Preguntas", donde vive la plantilla Excel. Vista previa/
            Archivar quedan siempre visibles arriba de las pestañas. */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-paper-border pb-3">
          <p className="text-xs text-ash-500">
            {moduleId
              ? `Examen de: ${(course.modules ?? []).find((m: any) => m.id === moduleId)?.title?.es ?? "módulo"}`
              : "Examen final del curso"}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setPreviewOpen(true)}>
              <Eye className="h-4 w-4" aria-hidden="true" /> Vista previa
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={handleArchiveToggle}>
              {assessment.archived ? (
                <>
                  <ArchiveRestore className="h-4 w-4" aria-hidden="true" /> Restaurar
                </>
              ) : (
                <>
                  <Archive className="h-4 w-4" aria-hidden="true" /> Archivar
                </>
              )}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="questions">
          <TabsList aria-label="Secciones del examen">
            <TabsTrigger value="questions">Preguntas</TabsTrigger>
            <TabsTrigger value="details">Detalles</TabsTrigger>
            <TabsTrigger value="appearance">Apariencia</TabsTrigger>
          </TabsList>

          <TabsContent value="questions">
            {isScormBacked ? (
              <p className="rounded-md bg-paper-muted p-3 text-xs text-ash-600">
                Este examen no tiene preguntas propias — su nota es la que reporta el paquete SCORM de «{scormBackedLabel ?? "un contenido de este curso"}
                ». Edítalo desde el bloque de esa lección/material, más abajo en este mismo curso (botón &ldquo;Editar con el editor&rdquo; o
                &ldquo;Subir paquete SCORM&rdquo;).
              </p>
            ) : isFileUpload ? (
              <p className="rounded-md bg-paper-muted p-3 text-xs text-ash-600">
                Este examen no tiene preguntas — el alumno descarga el archivo que subiste, lo completa offline, y sube su respuesta como archivo
                para que lo califiques a mano en /docente/evaluaciones-pendientes.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {/* "Es un poco pesado hacer pregunta por pregunta... ¿se
                    puede tener una plantilla en Excel?" / "Sigo sin ver
                    dónde descargar la plantilla" — es la tarea que más se
                    repite: va PRIMERO, antes de cualquier otra cosa de esta
                    pestaña, no enterrada después del contador de puntaje. */}
                <div className="flex flex-wrap items-center gap-2 rounded-md bg-paper-muted p-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => adminApi.downloadQuestionsTemplate(assessment.id).catch(() => alert("No pudimos generar la plantilla."))}
                  >
                    Descargar plantilla Excel
                  </Button>
                  <Button size="sm" variant="outline" disabled={importBusy} onClick={() => fileInputRef.current?.click()}>
                    {importBusy ? "Subiendo…" : "Subir preguntas"}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="hidden"
                    onChange={handleImportFile}
                  />
                  <span className="text-xs text-ash-500">Preguntas creadas en lote desde un archivo Excel (ver plantilla).</span>
                </div>
                {importResult && (
                  <Callout variant={importResult.errors.length > 0 ? "warning" : "success"}>
                    <p className="font-medium">
                      {importResult.created} pregunta{importResult.created === 1 ? "" : "s"} creada{importResult.created === 1 ? "" : "s"}
                      {importResult.errors.length > 0 && ` · ${importResult.errors.length} fila(s) con error`}
                    </p>
                    {importResult.errors.length > 0 && (
                      <ul className="mt-1 list-inside list-disc text-xs">
                        {importResult.errors.map((e, i) => (
                          <li key={i}>
                            Fila {e.row}: {e.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Callout>
                )}

                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink-900">Preguntas ({questions.length})</h3>
                  <span className={cn("text-xs font-medium", pointsOverLimit ? "text-danger" : "text-ash-500")}>
                    Puntaje total: {totalPoints} / 100
                  </span>
                </div>
                {pointsOverLimit && (
                  <Callout variant="danger">
                    La suma de puntos de las preguntas ({totalPoints}) supera 100. Ajusta el puntaje de alguna pregunta — mientras exceda 100, este
                    examen no podrá usarse en una evaluación (los alumnos no podrán empezar un intento).
                  </Callout>
                )}

                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-2">
                      {questions.map((q) => (
                        <SortableQuestionRow
                          key={q.id}
                          question={q}
                          editing={editingQuestionId === q.id}
                          onEdit={() => setEditingQuestionId(q.id)}
                          onCancelEdit={() => setEditingQuestionId(null)}
                          onDelete={() => handleDeleteQuestion(q.id)}
                          onSaved={() => {
                            setEditingQuestionId(null);
                            onChange();
                          }}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>

                {addingQuestion ? (
                  <QuestionForm
                    assessmentId={assessment.id}
                    onDone={() => {
                      setAddingQuestion(false);
                      onChange();
                    }}
                    onCancel={() => setAddingQuestion(false)}
                  />
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setAddingQuestion(true)} className="self-start">
                    + Agregar pregunta
                  </Button>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="details">
            <div className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label htmlFor="minScore">Nota mínima (%, sobre 100)</Label>
                  <Input id="minScore" type="number" min="0" max="100" value={minScore} onChange={(e) => setMinScore(e.target.value)} />
                  <p className="mt-1 text-xs text-ash-500">
                    No es la escala vigesimal (0-20) — el examen se corrige y se compara sobre 100 (ej.: 70 = necesitas 70% para aprobar).
                  </p>
                </div>
                <div>
                  <Label htmlFor="weight">Peso en fórmula ponderada (%)</Label>
                  <Input
                    id="weight"
                    type="number"
                    min="0"
                    max={maxWeight}
                    placeholder="No participa"
                    value={weightPercent}
                    onChange={(e) => setWeightPercent(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-ash-500">Disponible: {maxWeight}% (los demás exámenes del curso ya suman {otherWeightsSum}%)</p>
                </div>
                <div>
                  <Label htmlFor="maxAttempts">Intentos máximos</Label>
                  <Input id="maxAttempts" type="number" min="1" value={maxAttempts} onChange={(e) => setMaxAttempts(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="timeLimit">Límite de tiempo (min)</Label>
                  <Input id="timeLimit" type="number" min="1" value={timeLimitMinutes} onChange={(e) => setTimeLimitMinutes(e.target.value)} placeholder="Sin límite" />
                </div>
                <div>
                  <Label htmlFor="displayMode">Cómo se muestran las preguntas</Label>
                  <Select id="displayMode" value={displayMode} onChange={(e) => setDisplayMode(e.target.value)}>
                    <option value="ALL_AT_ONCE">Todas juntas en una pantalla</option>
                    <option value="ONE_BY_ONE">Una por una (sin volver atrás)</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="titleFont">Tipografía del título</Label>
                  <Select id="titleFont" value={titleFontFamily} onChange={(e) => setTitleFontFamily(e.target.value)}>
                    <option value="">Usar la del curso</option>
                    {BRAND_FONT_OPTIONS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  {/* "¿Cómo sabe cuál examen tomar en cada módulo?" */}
                  <Label htmlFor="moduleId">¿A qué módulo pertenece?</Label>
                  <Select id="moduleId" value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
                    <option value="">Examen final del curso</option>
                    {(course.modules ?? []).map((m: any) => (
                      <option key={m.id} value={m.id}>
                        {m.title?.es}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-1 text-xs text-ash-500">
                    Con módulo: se habilita apenas ESE módulo se completa. Sin módulo: se habilita al terminar el curso completo.
                  </p>
                </div>
              </div>
              {weightOverLimit && <Callout variant="danger">El peso no puede superar el {maxWeight}% disponible.</Callout>}
              {saveButton}
            </div>
          </TabsContent>

          <TabsContent value="appearance">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                {[
                  { label: "Cabecera", use: useCourseHeader, setUse: setUseCourseHeader, value: headerText, setValue: setHeaderText, id: "header", courseValue: course.examHeaderText?.es },
                  { label: "Instrucciones", use: useCourseInstructions, setUse: setUseCourseInstructions, value: instructionsText, setValue: setInstructionsText, id: "instructions", courseValue: course.examInstructionsText?.es },
                  { label: "Pie de página", use: useCourseFooter, setUse: setUseCourseFooter, value: footerText, setValue: setFooterText, id: "footer", courseValue: course.examFooterText?.es },
                ].map((f) => (
                  <div key={f.id}>
                    <div className="flex items-center justify-between">
                      <Label htmlFor={f.id}>{f.label}</Label>
                      <label className="flex items-center gap-1.5 text-xs text-ash-600">
                        <input type="checkbox" checked={f.use} onChange={(e) => f.setUse(e.target.checked)} />
                        Usar la del curso
                      </label>
                    </div>
                    {f.use ? (
                      <p className="rounded-md bg-paper-muted p-2 text-xs text-ash-600">
                        {f.courseValue || (
                          <span className="italic">El curso todavía no tiene una plantilla definida — configúrala más abajo, en &ldquo;Evaluaciones&rdquo;.</span>
                        )}
                      </p>
                    ) : (
                      <textarea
                        id={f.id}
                        className="min-h-[4rem] w-full rounded-md border border-paper-border bg-paper p-2 text-sm"
                        value={f.value}
                        onChange={(e) => f.setValue(e.target.value)}
                      />
                    )}
                  </div>
                ))}
              </div>
              {saveButton}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {previewOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink-950/60" onClick={() => setPreviewOpen(false)} aria-hidden="true" />
          <div className="relative z-10 max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg bg-paper p-4 shadow-raised">
            <div className="mb-2 flex justify-end">
              <Button variant="ghost" size="icon" aria-label="Cerrar vista previa" onClick={() => setPreviewOpen(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <ExamHeaderCard exam={previewInfo} locale="es" />
          </div>
        </div>
      )}
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { meApi } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";

/**
 * "Hay una opción de Guardados. ¿Cómo guardo un curso? ¿Para qué sirve?" —
 * antes no existía ningún botón en ninguna parte del sitio para guardar un
 * curso; la pestaña "Guardados" de Mis cursos quedaba vacía por diseño, sin
 * forma de llenarla. Este botón (en la ficha pública del curso) es esa
 * forma: guarda el interés sin matricularse todavía.
 */
export function SaveCourseButton({ courseId, initialSaved }: { courseId: string; initialSaved: boolean }) {
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const next = !saved;
    setSaved(next); // optimista: sensación inmediata, se revierte si falla
    try {
      await (next ? meApi.saveCourse(courseId) : meApi.unsaveCourse(courseId));
    } catch {
      setSaved(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" className="mt-2 w-full gap-1.5" onClick={toggle} disabled={busy}>
      {saved ? <BookmarkCheck className="h-4 w-4 text-indigo-600" aria-hidden="true" /> : <Bookmark className="h-4 w-4" aria-hidden="true" />}
      {saved ? "Guardado" : "Guardar para después"}
    </Button>
  );
}

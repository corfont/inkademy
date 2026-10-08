"use client";

import { useState } from "react";
import { adminApi, ApiError } from "@/lib/api-client";
import { Input, Label, Select } from "@/components/ui/Input";
import { FileDropzone } from "./FileDropzone";

export type WelcomeKind = "VIDEO" | "IMAGE" | "PDF" | "PRESENTATION" | "LINK";
export type WelcomeValue = {
  enabled: boolean;
  title: string;
  text: string;
  kind: WelcomeKind | "";
  assetId: string | null;
  linkUrl: string;
  /** Solo para previsualizar lo ya subido. */
  mediaUrl: string | null;
};

const TIPOS: { value: WelcomeKind; label: string; accept: string; hint: string }[] = [
  { value: "VIDEO", label: "Video (archivo)", accept: "video/*", hint: "MP4 recomendado" },
  { value: "IMAGE", label: "Imagen", accept: "image/*", hint: "Horizontal 16:9, JPG o PNG" },
  { value: "PDF", label: "PDF", accept: ".pdf,application/pdf", hint: "Se muestra dentro de la pantalla" },
  { value: "PRESENTATION", label: "Presentación (PowerPoint)", accept: ".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation", hint: "PPT o PPTX" },
  { value: "LINK", label: "Enlace (YouTube, Vimeo u otra web)", accept: "", hint: "" },
];

/**
 * «Cuando uno diseña un curso, ¿puede haber un video introductorio, un PPT o una imagen y de ahí pasar al curso?» — pantalla opcional que ve el
 * alumno al entrar por primera vez, antes de la primera clase, con un botón «Comenzar el curso».
 */
export function CourseWelcomeEditor({ value, onChange }: { value: WelcomeValue; onChange: (v: WelcomeValue) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tipo = TIPOS.find((t) => t.value === value.kind);
  const set = (patch: Partial<WelcomeValue>) => onChange({ ...value, ...patch });

  async function subir(file: File) {
    setUploading(true);
    setError(null);
    try {
      const { assetId, url } = await adminApi.uploadAsset(file);
      set({ assetId, mediaUrl: url });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos subir el archivo.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-lg border border-paper-border p-4">
      <label className="flex items-center gap-2 text-sm font-medium text-ink-900">
        <input type="checkbox" checked={value.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        Introducción antes de las clases (opcional)
      </label>
      <p className="mt-1 text-xs text-ash-500">
        El alumno la ve al entrar por primera vez, antes de la primera clase, y pasa al curso con el botón «Comenzar el curso». Después puede volver a verla desde el aula.
      </p>
      {value.enabled && (
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <Label htmlFor="welcome-title">Título</Label>
            <Input id="welcome-title" value={value.title} maxLength={160} placeholder="Bienvenido al curso" onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="welcome-text">Mensaje (qué aprenderá, cómo está organizado, cuánto tiempo necesita)</Label>
            <textarea
              id="welcome-text"
              value={value.text}
              maxLength={5000}
              rows={4}
              onChange={(e) => set({ text: e.target.value })}
              className="w-full rounded-md border border-paper-border bg-paper p-2 text-sm"
            />
          </div>
          <div className="max-w-xs">
            <Label htmlFor="welcome-kind">Material de introducción</Label>
            <Select id="welcome-kind" value={value.kind} onChange={(e) => set({ kind: e.target.value as WelcomeKind | "", assetId: null, mediaUrl: null, linkUrl: "" })}>
              <option value="">Solo texto</option>
              {TIPOS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </Select>
          </div>
          {value.kind === "LINK" && (
            <div>
              <Label htmlFor="welcome-link">Enlace</Label>
              <Input id="welcome-link" type="url" placeholder="https://www.youtube.com/watch?v=…" value={value.linkUrl} onChange={(e) => set({ linkUrl: e.target.value })} />
              <p className="mt-1 text-xs text-ash-500">YouTube y Vimeo se muestran dentro de la pantalla; cualquier otro enlace se ofrece como botón.</p>
            </div>
          )}
          {tipo && value.kind !== "LINK" && (
            <div>
              {value.mediaUrl && (
                <p className="mb-1 text-xs text-ash-600">
                  Archivo cargado: <a href={value.mediaUrl} target="_blank" rel="noreferrer" className="underline">ver</a>
                </p>
              )}
              <FileDropzone accept={tipo.accept} busy={uploading} label={value.assetId ? "Reemplazar archivo" : "Subir archivo"} hint={tipo.hint} onFile={subir} />
              {error && <p className="mt-1 text-xs text-danger">{error}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

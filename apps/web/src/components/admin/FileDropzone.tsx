"use client";

import { useCallback, useState } from "react";
import { UploadCloud } from "lucide-react";

/**
 * Antes cada punto de subida (portada del curso, video de lección, material
 * de lección) repetía el mismo <input type="file" className="hidden"> sin
 * ninguna zona de arrastrar-y-soltar. Este componente centraliza ambas
 * formas de elegir archivo (arrastrar o hacer click) en un solo lugar.
 */
export function FileDropzone({
  accept,
  busy,
  label,
  hint,
  onFile,
  multiple = false,
}: {
  accept?: string;
  busy?: boolean;
  label: string;
  hint?: string;
  onFile: (file: File) => void;
  /** Permite elegir/soltar varios archivos a la vez (p.ej. base de
   * conocimiento del asistente) — `onFile` se llama una vez por archivo, en
   * orden. Por defecto false: el resto de usos (portada de curso, video de
   * lección, etc.) siguen siendo de un solo archivo, sin cambios. */
  multiple?: boolean;
}) {
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList) return;
      const files = multiple ? Array.from(fileList) : fileList[0] ? [fileList[0]] : [];
      files.forEach(onFile);
    },
    [multiple, onFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      setDragging(false);
      if (busy) return;
      handleFiles(e.dataTransfer.files);
    },
    [busy, handleFiles],
  );

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed p-4 text-center text-sm transition-colors ${
        dragging ? "border-ink-500 bg-paper-muted" : "border-paper-border hover:border-ash-400"
      } ${busy ? "pointer-events-none opacity-60" : ""}`}
    >
      <UploadCloud className="h-5 w-5 text-ash-500" aria-hidden="true" />
      <span className="font-medium text-ink-700">{busy ? "Subiendo…" : label}</span>
      <span className="text-xs text-ash-500">{hint ?? "Arrastra el archivo aquí o haz click para elegirlo"}</span>
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}

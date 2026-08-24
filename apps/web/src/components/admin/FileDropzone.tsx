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
}: {
  accept?: string;
  busy?: boolean;
  label: string;
  hint?: string;
  onFile: (file: File) => void;
}) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault();
      setDragging(false);
      if (busy) return;
      const file = e.dataTransfer.files?.[0];
      if (file) onFile(file);
    },
    [busy, onFile],
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

"use client";

import { useState } from "react";
import { UploadCloud } from "lucide-react";

export function DropLabel({
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

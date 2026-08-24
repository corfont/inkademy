"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { suggestionsApi } from "@/lib/api-client";
import { Select } from "@/components/ui/Input";

const LABELS: Record<string, string> = {
  NEW: "Nueva",
  REVIEWED: "Revisada",
  PLANNED: "Planificada",
  DECLINED: "Descartada",
};

export function SuggestionStatusControl({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleChange(next: string) {
    setBusy(true);
    try {
      await suggestionsApi.updateStatus(id, next);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Select value={status} disabled={busy} onChange={(e) => handleChange(e.target.value)} className="h-9 w-40 flex-none text-xs">
      {Object.entries(LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </Select>
  );
}

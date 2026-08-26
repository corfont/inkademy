"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { meApi } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";

export function RetakeCourseButton({ enrollmentId }: { enrollmentId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function handleClick() {
    setStatus("loading");
    try {
      const { enrollmentId: newEnrollmentId } = await meApi.retakeCourse(enrollmentId);
      router.push(`/campus/cursos/${newEnrollmentId}`);
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="ghost" onClick={handleClick} disabled={status === "loading"}>
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        {status === "loading" ? "Matriculando…" : "Volver a llevar este curso"}
      </Button>
      {status === "error" && <p className="text-xs text-danger">No pudimos matricularte. Intenta de nuevo.</p>}
    </div>
  );
}

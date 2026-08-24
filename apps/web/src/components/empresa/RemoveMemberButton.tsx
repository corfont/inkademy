"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { companyApi, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";

/**
 * Antes companyApi.removeMember (DELETE /companies/:id/members/:membershipId)
 * existía pero ninguna pantalla lo llamaba — no había forma de dar de baja a
 * un colaborador desde la interfaz.
 */
export function RemoveMemberButton({ companyId, membershipId, memberName }: { companyId: string; membershipId: string; memberName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRemove() {
    if (!confirm(`¿Quitar a ${memberName} de la empresa? Perderá acceso a los cursos asignados por cupos.`)) return;
    setBusy(true);
    setError(null);
    try {
      await companyApi.removeMember(companyId, membershipId);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos quitar al colaborador.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-bg" disabled={busy} onClick={handleRemove}>
        Quitar
      </Button>
      {error && <p className="max-w-[12rem] text-right text-xs text-danger">{error}</p>}
    </div>
  );
}

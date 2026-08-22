"use client";

import { useState } from "react";
import { companyApi, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";

interface MemberOption {
  userId: string;
  label: string;
}

/**
 * Antes este botón no tenía ninguna acción: existía companyApi.assignSeat
 * (POST /companies/:id/seat-pools/:poolId/assign) pero ninguna pantalla lo
 * llamaba. Al abrir, carga los colaboradores ACTIVOS de la empresa y asigna
 * el cupo al que se elija.
 */
export function AssignSeatButton({ companyId, poolId, disabled }: { companyId: string; poolId: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<MemberOption[] | null>(null);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleOpen() {
    setOpen(true);
    setError(null);
    if (members) return;
    setLoading(true);
    try {
      const raw = await companyApi.members(companyId, {});
      const active = raw
        .filter((m: any) => m.status === "ACTIVE" && m.userId)
        .map((m: any) => ({
          userId: m.userId,
          label:
            m.user?.displayName ||
            [m.user?.firstName, m.user?.lastName].filter(Boolean).join(" ") ||
            m.user?.email ||
            m.userId,
        }));
      setMembers(active);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos cargar los colaboradores.");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      await companyApi.assignSeat(companyId, poolId, selected);
      setDone(true);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos asignar el cupo.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return <span className="text-sm text-success">Cupo asignado</span>;
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" disabled={disabled} onClick={handleOpen}>
        Asignar
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <Select className="h-9 w-48 text-sm" value={selected} onChange={(e) => setSelected(e.target.value)} disabled={loading || !members}>
          <option value="">{loading ? "Cargando…" : "Elige un colaborador"}</option>
          {members?.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.label}
            </option>
          ))}
        </Select>
        <Button size="sm" disabled={loading || !selected} onClick={handleConfirm}>
          Confirmar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
      {members && members.length === 0 && <p className="text-xs text-ash-500">No hay colaboradores activos para asignar.</p>}
      {error && <p className="max-w-[16rem] text-right text-xs text-danger">{error}</p>}
    </div>
  );
}

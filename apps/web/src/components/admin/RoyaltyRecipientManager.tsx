"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, ApiError } from "@/lib/api-client";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

const BILLING_LABEL: Record<string, string> = {
  PER_ENROLLMENT: "Por alumno matriculado",
  PER_COMPLETION: "Por alumno que termina el curso",
  PER_REFERRAL: "Por referido (% de lo que paga cada alumno traído)",
};

/**
 * "Alguien hizo el curso, le dice a Inkademy: por cada matriculado tú me
 * pagas un %, o por cada alumno que termina, o yo te traigo alumnos y tú me
 * pagas un %." Quien recibe la regalía no es un usuario de la plataforma
 * (no inicia sesión) — se administra como entidad externa, igual que un
 * convenio institucional. El costo entra automáticamente a "Otros gastos"
 * en /admin/finanzas, en la moneda configurada.
 */
export function RoyaltyRecipientManager({ recipients, courses }: { recipients: any[]; courses: any[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    contactEmail: "",
    billingType: "PER_ENROLLMENT" as "PER_ENROLLMENT" | "PER_COMPLETION" | "PER_REFERRAL",
    feePercent: "",
    feeCurrency: "PEN" as "PEN" | "USD",
  });

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Ocurrió un error.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    await run(() =>
      adminApi.createRoyaltyRecipient({
        name: form.name,
        contactEmail: form.contactEmail || undefined,
        billingType: form.billingType,
        feePercent: form.feePercent ? Number(form.feePercent) : undefined,
        feeCurrency: form.feeCurrency,
      }),
    );
    setForm({ name: "", contactEmail: "", billingType: "PER_ENROLLMENT", feePercent: "", feeCurrency: "PEN" });
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <Callout variant="danger">{error}</Callout>}

      <Callout variant="info">
        No es un rol de usuario — quien recibe la regalía no inicia sesión en Inkademy. El costo estimado se suma automáticamente a "Otros gastos"
        en /admin/finanzas, en la moneda que configures aquí.
      </Callout>

      {recipients.length === 0 && <p className="text-sm text-ash-500">Todavía no hay ningún destinatario de regalías creado.</p>}

      {recipients.map((r) => (
        <Card key={r.id}>
          <CardContent className="flex flex-col gap-3 p-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-serif text-lg font-semibold text-ink-900">{r.name}</h3>
                <p className="text-xs text-ash-500">{r.contactEmail || "sin correo de contacto"}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{BILLING_LABEL[r.billingType]}</Badge>
                <Badge variant="outline">
                  {r.feePercent}% ({r.feeCurrency === "USD" ? "US$" : "S/"})
                </Badge>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => adminApi.updateRoyaltyRecipient(r.id, { active: !r.active }))}>
                  {r.active ? "Desactivar" : "Activar"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger hover:bg-danger-bg"
                  disabled={busy}
                  onClick={() => confirm(`¿Eliminar a ${r.name}? Se quitarán sus asociaciones a cursos.`) && run(() => adminApi.deleteRoyaltyRecipient(r.id))}
                >
                  Eliminar
                </Button>
              </div>
            </div>

            <CourseRoyaltyEditor royaltyRecipientId={r.id} assigned={r.courses ?? []} courses={courses} busy={busy} run={run} />
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Nuevo destinatario de regalías</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="rr-name">Nombre</Label>
              <Input id="rr-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="rr-email">Correo de contacto (opcional)</Label>
              <Input id="rr-email" type="email" value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="rr-billing">Modelo de regalía</Label>
              <Select id="rr-billing" value={form.billingType} onChange={(e) => setForm((f) => ({ ...f, billingType: e.target.value as never }))}>
                <option value="PER_ENROLLMENT">Por alumno matriculado</option>
                <option value="PER_COMPLETION">Por alumno que termina el curso</option>
                <option value="PER_REFERRAL">Por referido (% de lo que paga cada alumno traído)</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="rr-fee">
                {form.billingType === "PER_REFERRAL" ? "% sobre lo que paga cada alumno" : "Monto por alumno"}
              </Label>
              <div className="flex gap-2">
                <Input id="rr-fee" type="number" min="0" step="0.01" value={form.feePercent} onChange={(e) => setForm((f) => ({ ...f, feePercent: e.target.value }))} />
                {form.billingType !== "PER_REFERRAL" && (
                  <Select className="w-24" value={form.feeCurrency} onChange={(e) => setForm((f) => ({ ...f, feeCurrency: e.target.value as "PEN" | "USD" }))}>
                    <option value="PEN">Soles</option>
                    <option value="USD">Dólares</option>
                  </Select>
                )}
              </div>
              {form.billingType !== "PER_REFERRAL" && (
                <p className="mt-1 text-xs text-ash-500">Por simplicidad, en este modelo el número es un monto fijo por alumno, no un %.</p>
              )}
            </div>
          </div>
          <div>
            <Button disabled={busy || !form.name.trim()} onClick={handleCreate}>
              {busy ? "Guardando…" : "Crear destinatario"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CourseRoyaltyEditor({
  royaltyRecipientId,
  assigned,
  courses,
  busy,
  run,
}: {
  royaltyRecipientId: string;
  assigned: any[];
  courses: any[];
  busy: boolean;
  run: (action: () => Promise<unknown>) => Promise<void>;
}) {
  const [courseId, setCourseId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  return (
    <div className="rounded-md bg-paper-muted p-3">
      <p className="mb-2 text-xs font-medium text-ash-600">Cursos con esta regalía</p>
      {assigned.length === 0 ? (
        <p className="text-xs text-ash-500">Ningún curso asignado todavía.</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-1">
          {assigned.map((a: any) => (
            <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
              <span>
                {a.course?.title?.es ?? a.course?.slug}
                {(a.startDate || a.endDate) && (
                  <span className="text-ash-500">
                    {" "}
                    ({a.startDate ? new Date(a.startDate).toLocaleDateString("es-PE") : "…"} —{" "}
                    {a.endDate ? new Date(a.endDate).toLocaleDateString("es-PE") : "…"})
                  </span>
                )}
              </span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => adminApi.removeCourseRoyalty(a.id))}>
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <Select className="h-8 w-48 text-xs" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          <option value="">Elegir curso…</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title?.es ?? c.slug}
            </option>
          ))}
        </Select>
        <Input type="date" className="h-8 w-32 text-xs" value={startDate} onChange={(e) => setStartDate(e.target.value)} title="Desde (opcional)" />
        <Input type="date" className="h-8 w-32 text-xs" value={endDate} onChange={(e) => setEndDate(e.target.value)} title="Hasta (opcional)" />
        <Button
          size="sm"
          disabled={busy || !courseId}
          onClick={() => {
            run(() => adminApi.addCourseRoyalty(royaltyRecipientId, { courseId, startDate: startDate || undefined, endDate: endDate || undefined }));
            setCourseId("");
            setStartDate("");
            setEndDate("");
          }}
        >
          Asignar
        </Button>
      </div>
    </div>
  );
}

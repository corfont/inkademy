"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, ApiError } from "@/lib/api-client";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

const BILLING_LABEL: Record<string, string> = {
  FIXED: "Monto fijo",
  PER_COURSE: "Por curso dictado (por certificado emitido)",
  PER_PERIOD: "Por plazo (rango de fechas)",
};

/**
 * "A veces se tiene un convenio con un instituto o universidad de
 * prestigio, donde debería estar la firma de esa institución también...
 * esa institución nos podría cobrar un fijo o un variable, por curso
 * dictado o por un plazo." — modela la institución socia (con su firma
 * para el certificado y su modelo de cobro) y qué cursos concretos caen
 * bajo ese convenio, con un rango de fechas opcional.
 */
export function PartnerInstitutionManager({ institutions, courses }: { institutions: any[]; courses: any[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    contactEmail: "",
    signerName: "",
    signerTitle: "",
    billingType: "FIXED" as "FIXED" | "PER_COURSE" | "PER_PERIOD",
    feeAmount: "",
    invoicesDirectly: false,
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
      adminApi.createPartnerInstitution({
        name: form.name,
        contactEmail: form.contactEmail || undefined,
        signerName: form.signerName || undefined,
        signerTitle: form.signerTitle || undefined,
        billingType: form.billingType,
        feeAmount: form.feeAmount ? Number(form.feeAmount) : undefined,
        invoicesDirectly: form.invoicesDirectly,
      }),
    );
    setForm({ name: "", contactEmail: "", signerName: "", signerTitle: "", billingType: "FIXED", feeAmount: "", invoicesDirectly: false });
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <Callout variant="danger">{error}</Callout>}

      <Callout variant="info">
        Cada convenio agrega una <strong>tercera firma</strong> al certificado (docente + Inkapitales + institución socia) para los cursos que le
        asignes. El costo del convenio se suma automáticamente a "Otros gastos" en /admin/finanzas.
      </Callout>

      {institutions.map((inst) => (
        <Card key={inst.id}>
          <CardContent className="flex flex-col gap-3 p-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-serif text-lg font-semibold text-ink-900">{inst.name}</h3>
                <p className="text-xs text-ash-500">
                  Firma: {inst.signerName || "sin configurar"} {inst.signerTitle && `(${inst.signerTitle})`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{BILLING_LABEL[inst.billingType]}</Badge>
                {inst.feeAmount != null && <Badge variant="outline">S/ {Number(inst.feeAmount).toFixed(2)}</Badge>}
                {inst.invoicesDirectly && <Badge variant="warning">Factura ella misma</Badge>}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => run(() => adminApi.updatePartnerInstitution(inst.id, { active: !inst.active }))}
                >
                  {inst.active ? "Desactivar" : "Activar"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger hover:bg-danger-bg"
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`¿Eliminar el convenio con ${inst.name}? Se quitarán todas sus asociaciones a cursos.`)) {
                      run(() => adminApi.deletePartnerInstitution(inst.id));
                    }
                  }}
                >
                  Eliminar
                </Button>
              </div>
            </div>

            <CoursePartnershipEditor institutionId={inst.id} assigned={inst.courses ?? []} courses={courses} busy={busy} run={run} />
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Nuevo convenio institucional</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="pi-name">Nombre de la institución</Label>
              <Input id="pi-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="pi-email">Correo de contacto (opcional)</Label>
              <Input id="pi-email" type="email" value={form.contactEmail} onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="pi-signer-name">Nombre de quien firma por la institución</Label>
              <Input id="pi-signer-name" value={form.signerName} onChange={(e) => setForm((f) => ({ ...f, signerName: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="pi-signer-title">Cargo de quien firma</Label>
              <Input id="pi-signer-title" value={form.signerTitle} onChange={(e) => setForm((f) => ({ ...f, signerTitle: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="pi-billing">Modelo de cobro</Label>
              <Select id="pi-billing" value={form.billingType} onChange={(e) => setForm((f) => ({ ...f, billingType: e.target.value as never }))}>
                <option value="FIXED">Monto fijo (mensual)</option>
                <option value="PER_COURSE">Variable — por curso dictado (por certificado emitido)</option>
                <option value="PER_PERIOD">Variable — por un plazo (rango de fechas)</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="pi-fee">Monto (S/)</Label>
              <Input id="pi-fee" type="number" min="0" step="0.01" value={form.feeAmount} onChange={(e) => setForm((f) => ({ ...f, feeAmount: e.target.value }))} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-ash-600">
            <input type="checkbox" checked={form.invoicesDirectly} onChange={(e) => setForm((f) => ({ ...f, invoicesDirectly: e.target.checked }))} />
            Esta institución emite ella misma el comprobante SUNAT al cliente final y nos transfiere el neto después (Inkapitales no factura estas
            ventas)
          </label>
          <div>
            <Button disabled={busy || !form.name.trim()} onClick={handleCreate}>
              {busy ? "Guardando…" : "Crear convenio"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CoursePartnershipEditor({
  institutionId,
  assigned,
  courses,
  busy,
  run,
}: {
  institutionId: string;
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
      <p className="mb-2 text-xs font-medium text-ash-600">Cursos bajo este convenio</p>
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
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => adminApi.removeCoursePartnership(a.id))}>
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
            run(() => adminApi.addCoursePartnership(institutionId, { courseId, startDate: startDate || undefined, endDate: endDate || undefined }));
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

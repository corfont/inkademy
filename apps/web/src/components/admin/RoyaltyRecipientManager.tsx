"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi, ApiError } from "@/lib/api-client";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ConfirmButton } from "@/components/ui/ConfirmButton";

const BILLING_LABEL: Record<string, string> = {
  PER_ENROLLMENT: "Por alumno matriculado",
  PER_COMPLETION: "Por alumno que termina el curso",
  PER_REFERRAL: "Por referido (% de lo que paga cada alumno traído)",
};

const ROLE_LABEL: Record<string, string> = {
  STUDENT: "Alumno",
  TEACHER: "Docente",
  SUPPORT: "Soporte",
  ADMIN: "Admin",
  COMPANY: "Empresa",
  EXTERNAL: "Externo",
};

/**
 * "El que recibe regalías puede ser un docente, un personal externo,
 * inclusive un alumno... depende de lo que la empresa quiera ofrecer" —
 * opcionalmente vinculado a una cuenta real de la plataforma (de cualquier
 * rol, incluido el nuevo GlobalRole.EXTERNAL para quien solo busca
 * regalías); si no se vincula a nadie, sigue funcionando como contacto
 * externo en texto libre (comportamiento anterior). El costo entra
 * automáticamente a "Otros gastos" en /admin/finanzas.
 */
export function RoyaltyRecipientManager({ recipients, courses }: { recipients: any[]; courses: any[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    userId: "",
    name: "",
    contactEmail: "",
    billingType: "PER_ENROLLMENT" as "PER_ENROLLMENT" | "PER_COMPLETION" | "PER_REFERRAL",
    feePercent: "",
    feeCurrency: "PEN" as "PEN" | "USD",
  });
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<any[]>([]);
  const [linkedUserLabel, setLinkedUserLabel] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  function handleUserQueryChange(q: string) {
    setUserQuery(q);
    setLinkedUserLabel(null);
    setForm((f) => ({ ...f, userId: "" }));
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim()) {
      setUserResults([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      adminApi
        .users({ q })
        .then((rows) => setUserResults(rows.slice(0, 6)))
        .catch(() => setUserResults([]));
    }, 300);
  }

  function pickUser(u: any) {
    const displayName = u.displayName || `${u.firstName} ${u.lastName}`;
    setForm((f) => ({ ...f, userId: u.id, name: displayName, contactEmail: u.email }));
    setLinkedUserLabel(`${displayName} · ${ROLE_LABEL[u.globalRole] ?? u.globalRole}`);
    setUserQuery("");
    setUserResults([]);
  }

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
        userId: form.userId || undefined,
        name: form.name,
        contactEmail: form.contactEmail || undefined,
        billingType: form.billingType,
        feePercent: form.feePercent ? Number(form.feePercent) : undefined,
        feeCurrency: form.feeCurrency,
      }),
    );
    setForm({ userId: "", name: "", contactEmail: "", billingType: "PER_ENROLLMENT", feePercent: "", feeCurrency: "PEN" });
    setLinkedUserLabel(null);
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <Callout variant="danger">{error}</Callout>}

      <Callout variant="info">
        Puedes vincularlo a la cuenta real de un docente, alumno, soporte o externo — o dejarlo como contacto externo sin cuenta. El costo
        estimado se suma automáticamente a "Otros gastos" en /admin/finanzas, en la moneda que configures aquí.
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
                {r.user ? (
                  <Badge variant="success">{ROLE_LABEL[r.user.globalRole] ?? r.user.globalRole} · cuenta vinculada</Badge>
                ) : (
                  <Badge variant="outline">Contacto externo</Badge>
                )}
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
                  onClick={() => setDeleteTarget({ id: r.id, name: r.name })}
                >
                  Eliminar
                </Button>
              </div>
            </div>

            <PaymentDetailsEditor recipient={r} busy={busy} run={run} />
            <CourseRoyaltyEditor royaltyRecipientId={r.id} assigned={r.courses ?? []} courses={courses} busy={busy} run={run} />
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Nuevo destinatario de regalías</h2>

          <div className="relative">
            <Label htmlFor="rr-user-search">Vincular a una cuenta existente (opcional) — docente, alumno, soporte, externo…</Label>
            {linkedUserLabel ? (
              <div className="flex items-center justify-between rounded-md border border-paper-border bg-paper-muted px-3 py-2 text-sm">
                <span>{linkedUserLabel}</span>
                <button
                  type="button"
                  className="text-xs text-ash-500 hover:text-danger"
                  onClick={() => {
                    setLinkedUserLabel(null);
                    setForm((f) => ({ ...f, userId: "" }));
                  }}
                >
                  Quitar
                </button>
              </div>
            ) : (
              <>
                <Input
                  id="rr-user-search"
                  placeholder="Buscar por nombre o correo…"
                  value={userQuery}
                  onChange={(e) => handleUserQueryChange(e.target.value)}
                />
                {userResults.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full rounded-md border border-paper-border bg-paper shadow-raised">
                    {userResults.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-paper-muted"
                          onClick={() => pickUser(u)}
                        >
                          <span className="font-medium text-ink-900">{u.displayName || `${u.firstName} ${u.lastName}`}</span>
                          <span className="text-xs text-ash-500">
                            {u.email} · {ROLE_LABEL[u.globalRole] ?? u.globalRole}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            <p className="mt-1 text-xs text-ash-500">Si no encuentras a la persona (no tiene cuenta), déjalo así y complétalo abajo como contacto externo.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="rr-name">Nombre</Label>
              <Input id="rr-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} disabled={Boolean(form.userId)} />
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

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (target) run(() => adminApi.deleteRoyaltyRecipient(target.id));
        }}
        title="Eliminar destinatario"
        message={`¿Eliminar a ${deleteTarget?.name}? Se quitarán sus asociaciones a cursos.`}
        confirmLabel="Eliminar"
        danger
        busy={busy}
      />
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
                {/* Sin fecha de fin = regalía indefinida (no vence). Las fechas son calendario puras: se muestran en UTC para no correrlas un día. */}
                <span className="text-ash-500">
                  {" "}
                  ({a.startDate ? `desde ${new Date(a.startDate).toLocaleDateString("es-PE", { timeZone: "UTC" })}` : "desde el inicio"} ·{" "}
                  {a.endDate ? `hasta ${new Date(a.endDate).toLocaleDateString("es-PE", { timeZone: "UTC" })}` : "indefinida, sin fecha límite"})
                </span>
              </span>
              <ConfirmButton
                size="sm"
                variant="ghost"
                disabled={busy}
                title="¿Quitar esta regalía del curso?"
                message={`Se deja de calcular la regalía de «${a.course?.title?.es ?? a.course?.slug}» para este beneficiario. Las ventas que ya se registraron no cambian.`}
                confirmLabel="Sí, quitar"
                onConfirm={() => run(() => adminApi.removeCourseRoyalty(a.id))}
              >
                Quitar
              </ConfirmButton>
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
        <label className="flex flex-col gap-0.5 text-[11px] text-ash-500">
          Desde (opcional)
          <Input type="date" className="h-8 w-32 text-xs" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] text-ash-500">
          Hasta (vacío = indefinida)
          <Input type="date" className="h-8 w-32 text-xs" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
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

/**
 * Cómo se le paga a quien recibe regalías: titular, banco, cuenta y CCI. Si el destinatario está vinculado a una cuenta de la plataforma con sus propios
 * datos bancarios y aquí no se llenó nada, se muestran esos (sin duplicar a mano lo que la persona ya registró en su perfil).
 */
function PaymentDetailsEditor({ recipient, busy, run }: { recipient: any; busy: boolean; run: (a: () => Promise<unknown>) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    accountHolder: recipient.accountHolder ?? "",
    bankName: recipient.bankName ?? "",
    accountNumber: recipient.accountNumber ?? "",
    accountCci: recipient.accountCci ?? "",
    documentType: (recipient.documentType ?? "") as "" | "DNI" | "RUC" | "CE",
    documentNumber: recipient.documentNumber ?? "",
  });
  const own = recipient.accountNumber || recipient.accountCci;
  const fromUser = !own && (recipient.user?.bankAccountNumber || recipient.user?.bankAccountCci);
  return (
    <div className="rounded-md border border-paper-border p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-ash-600">
          {own
            ? `Pago: ${recipient.bankName ?? "banco no indicado"} · cuenta ${recipient.accountNumber ?? "—"}${recipient.accountCci ? ` · CCI ${recipient.accountCci}` : ""}${recipient.accountHolder ? ` · titular ${recipient.accountHolder}` : ""}`
            : fromUser
              ? `Pago (de su perfil): ${recipient.user.bankName ?? "banco no indicado"} · cuenta ${recipient.user.bankAccountNumber ?? "—"}${recipient.user.bankAccountCci ? ` · CCI ${recipient.user.bankAccountCci}` : ""}`
              : <span className="font-medium text-warning">Sin datos de pago registrados</span>}
        </p>
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>{open ? "Cerrar" : "Datos de pago"}</Button>
      </div>
      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div><Label htmlFor={`rp-h-${recipient.id}`}>Titular de la cuenta</Label><Input id={`rp-h-${recipient.id}`} value={f.accountHolder} onChange={(e) => setF({ ...f, accountHolder: e.target.value })} /></div>
          <div><Label htmlFor={`rp-b-${recipient.id}`}>Banco</Label><Input id={`rp-b-${recipient.id}`} value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} /></div>
          <div><Label htmlFor={`rp-n-${recipient.id}`}>N.º de cuenta</Label><Input id={`rp-n-${recipient.id}`} value={f.accountNumber} onChange={(e) => setF({ ...f, accountNumber: e.target.value })} /></div>
          <div><Label htmlFor={`rp-c-${recipient.id}`}>CCI (20 dígitos)</Label><Input id={`rp-c-${recipient.id}`} value={f.accountCci} inputMode="numeric" onChange={(e) => setF({ ...f, accountCci: e.target.value })} /></div>
          <div>
            <Label htmlFor={`rp-dt-${recipient.id}`}>Documento del titular</Label>
            <Select id={`rp-dt-${recipient.id}`} value={f.documentType} onChange={(e) => setF({ ...f, documentType: e.target.value as "" | "DNI" | "RUC" | "CE" })}>
              <option value="">—</option>
              <option value="DNI">DNI</option>
              <option value="RUC">RUC</option>
              <option value="CE">Carné de extranjería</option>
            </Select>
          </div>
          <div><Label htmlFor={`rp-dn-${recipient.id}`}>N.º de documento</Label><Input id={`rp-dn-${recipient.id}`} value={f.documentNumber} onChange={(e) => setF({ ...f, documentNumber: e.target.value })} /></div>
          <div className="sm:col-span-3">
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await adminApi.updateRoyaltyRecipient(recipient.id, {
                    accountHolder: f.accountHolder.trim() || null,
                    bankName: f.bankName.trim() || null,
                    accountNumber: f.accountNumber.trim() || null,
                    accountCci: f.accountCci.replace(/[\s-]/g, "") || null,
                    documentType: f.documentType || null,
                    documentNumber: f.documentNumber.trim() || null,
                  });
                  setOpen(false);
                })
              }
            >
              Guardar datos de pago
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

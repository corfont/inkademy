"use client";

import { useEffect, useRef, useState } from "react";
import { adminApi, companyApi, ApiError } from "@/lib/api-client";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";

const ROLE_LABEL: Record<string, string> = { STUDENT: "Alumno", TEACHER: "Docente", SUPPORT: "Soporte", ADMIN: "Administrador" };

interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  globalRole: string;
  status: string;
  createdAt: string;
  signatureAssetId?: string | null;
  signatureUrl?: string | null;
  companies?: { companyId: string; companyName: string; role: string }[];
}

function emailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

export function UsersManager() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [groupByDomain, setGroupByDomain] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // React StrictMode (dev) monta los efectos dos veces, y una búsqueda
  // rápida dispara un tercer fetch — sin esto, la respuesta del fetch
  // VIEJO (sin filtro) podía llegar después y pisar el resultado filtrado
  // correcto. Solo se aplica la respuesta del fetch más reciente.
  const requestSeq = useRef(0);

  async function refresh(query?: string) {
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const data = await adminApi.users({ q: query ?? q });
      if (seq !== requestSeq.current) return; // llegó una búsqueda más nueva mientras esperábamos esta
      setUsers(data);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setError(err instanceof ApiError ? err.message : "No pudimos cargar los usuarios.");
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    adminApi
      .companies()
      .then(setCompanies)
      .catch(() => setCompanies([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Agrupar por dominio de correo ayuda a ubicar de un vistazo a todos los
  // que probablemente sean de la misma empresa (p.ej. todos los
  // @corporacionandina.com) antes de asignarlos — sin esto había que
  // adivinar mirando la lista completa sin ningún orden por dominio. Si
  // alguien de ese dominio YA está vinculado a una empresa (creada a
  // través de "Asignar a empresa"), se muestra su razón social + RUC en
  // vez del dominio pelado — mucho más útil para reconocer de un vistazo
  // de qué empresa se trata.
  const groups: Array<{ domain: string; label: string; rows: UserRow[] }> = groupByDomain
    ? Object.entries(
        users.reduce<Record<string, UserRow[]>>((acc, u) => {
          const key = emailDomain(u.email);
          (acc[key] ??= []).push(u);
          return acc;
        }, {}),
      )
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([domain, rows]) => {
          const linkedCompanyId = rows.find((r) => r.companies && r.companies.length > 0)?.companies?.[0]?.companyId;
          const company = linkedCompanyId ? companies.find((c) => c.id === linkedCompanyId) : null;
          const label = company ? `${company.legalName} (RUC ${company.taxId}) — @${domain}` : `@${domain}`;
          return { domain, label, rows };
        })
    : [{ domain: "", label: "", rows: users }];

  return (
    <div className="flex flex-col gap-6">
      {error && <Callout variant="danger">{error}</Callout>}

      <CreateUserForm onCreated={() => refresh()} />

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <div className="flex flex-wrap items-center gap-4">
            <form
              className="flex flex-1 gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                refresh();
              }}
            >
              <Input placeholder="Buscar por nombre o correo…" value={q} onChange={(e) => setQ(e.target.value)} />
              <Button type="submit" variant="outline">
                Buscar
              </Button>
            </form>
            <label className="flex items-center gap-2 text-sm text-ash-600">
              <input type="checkbox" checked={groupByDomain} onChange={(e) => setGroupByDomain(e.target.checked)} />
              Agrupar por dominio de correo
            </label>
          </div>

          {loading ? (
            <p className="text-sm text-ash-500">Cargando…</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-ash-500">No se encontraron usuarios.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map((group) => (
                <div key={group.domain || "all"} className="overflow-x-auto">
                  {group.label && (
                    <p className="mb-1 rounded bg-paper-muted px-2 py-1 text-xs font-semibold text-ash-600">
                      {group.label} ({group.rows.length})
                    </p>
                  )}
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-paper-border text-ash-500">
                      <tr>
                        <th className="p-2 font-medium">Nombre</th>
                        <th className="p-2 font-medium">Correo</th>
                        <th className="p-2 font-medium">Rol</th>
                        <th className="p-2 font-medium">Firma</th>
                        <th className="p-2 font-medium">Empresa</th>
                        <th className="p-2 font-medium">Estado</th>
                        <th className="p-2 font-medium">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((u) => (
                        <UserRowItem key={u.id} user={u} companies={companies} onChange={() => refresh()} />
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UserRowItem({ user, companies, onChange }: { user: UserRow; companies: any[]; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [companyRole, setCompanyRole] = useState<"COMPANY_ADMIN" | "PARTICIPANT">("PARTICIPANT");

  // Sugerencia por dominio de correo: si el dominio del usuario coincide con
  // el de alguna empresa ya registrada (comparando contra su razón social
  // normalizada), se preselecciona esa empresa en el desplegable — no
  // asigna solo, el admin igual tiene que confirmar.
  const domain = emailDomain(user.email).split(".")[0];
  const suggestedCompany = companies.find((c) => c.legalName?.toLowerCase().replace(/[^a-z0-9]/g, "").includes(domain));

  async function handleAssignCompany() {
    if (!companyId) return;
    setBusy(true);
    setRowError(null);
    try {
      await companyApi.inviteMember(companyId, { email: user.email, role: companyRole });
      setAssigning(false);
      onChange();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "No pudimos asignarlo a la empresa.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRoleChange(globalRole: string) {
    setBusy(true);
    setRowError(null);
    try {
      await adminApi.updateUser(user.id, { globalRole });
      onChange();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "No pudimos cambiar el rol.");
      setBusy(false);
    }
  }

  async function handleToggleStatus() {
    const next = user.status === "active" ? "disabled" : "active";
    if (next === "disabled" && !confirm(`¿Desactivar la cuenta de ${user.email}? No podrá iniciar sesión hasta que la reactives.`)) return;
    setBusy(true);
    setRowError(null);
    try {
      await adminApi.updateUser(user.id, { status: next });
      onChange();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "No pudimos cambiar el estado.");
      setBusy(false);
    }
  }

  async function handleSignatureUpload(file: File) {
    setBusy(true);
    setRowError(null);
    try {
      const { assetId } = await adminApi.uploadAsset(file);
      await adminApi.updateUser(user.id, { signatureAssetId: assetId });
      onChange();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "No pudimos subir la firma.");
      setBusy(false);
    }
  }

  async function handleSignatureRemove() {
    setBusy(true);
    setRowError(null);
    try {
      await adminApi.updateUser(user.id, { signatureAssetId: null });
      onChange();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "No pudimos quitar la firma.");
      setBusy(false);
    }
  }

  async function handleResetPassword() {
    const custom = prompt(
      "Si el usuario ya te dijo qué contraseña quiere, escríbela aquí (mín. 8 caracteres, con letra, número y un carácter especial +-*!$%&).\n\nDeja el campo vacío para generar una temporal y pasársela tú.",
    );
    if (custom === null) return; // canceló
    setBusy(true);
    setRowError(null);
    try {
      const result = await adminApi.resetUserPassword(user.id, custom.trim() || undefined);
      if (result.tempPassword) {
        alert(`Contraseña temporal para ${user.email}:\n\n${result.tempPassword}\n\n(Solo se muestra esta vez — pásasela al usuario ahora.)`);
      } else {
        alert(`Listo: la contraseña de ${user.email} se actualizó a la que escribiste.`);
      }
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "No pudimos restablecer la contraseña.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar la cuenta de ${user.email}? Si tiene compras, certificados o matrículas, no se podrá — desactívala en ese caso.`)) return;
    setBusy(true);
    setRowError(null);
    try {
      await adminApi.deleteUser(user.id);
      onChange();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "No pudimos eliminar la cuenta.");
      setBusy(false);
    }
  }

  return (
    <tr className="border-b border-paper-border last:border-0">
      <td className="p-2">
        <div className="flex items-center gap-2">
          <Avatar name={`${user.firstName} ${user.lastName}`} size="sm" />
          <span>
            {user.firstName} {user.lastName}
          </span>
        </div>
      </td>
      <td className="p-2 text-ash-600">{user.email}</td>
      <td className="p-2">
        <Select value={user.globalRole} disabled={busy} onChange={(e) => handleRoleChange(e.target.value)} className="h-9 text-xs">
          {Object.entries(ROLE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </td>
      <td className="p-2">
        {user.globalRole !== "TEACHER" ? (
          <span className="text-xs text-ash-400">Solo docentes</span>
        ) : user.signatureUrl ? (
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={user.signatureUrl} alt="Firma" className="h-8 w-16 rounded border border-paper-border object-contain bg-paper" />
            <Button size="sm" variant="ghost" disabled={busy} onClick={handleSignatureRemove}>
              Quitar
            </Button>
          </div>
        ) : (
          <label className="cursor-pointer text-xs font-medium text-ink-700 hover:underline">
            Subir firma
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              disabled={busy}
              onChange={(e) => e.target.files?.[0] && handleSignatureUpload(e.target.files[0])}
            />
          </label>
        )}
      </td>
      <td className="p-2">
        {user.companies && user.companies.length > 0 ? (
          <div className="flex flex-col gap-0.5">
            {user.companies.map((c) => (
              <span key={c.companyId} className="text-xs text-ash-600">
                {c.companyName} <span className="text-ash-400">({c.role === "COMPANY_ADMIN" ? "Admin" : "Colaborador"})</span>
              </span>
            ))}
          </div>
        ) : assigning ? (
          <div className="flex flex-col gap-1">
            <Select className="h-8 w-40 text-xs" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">Elegir empresa…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.legalName}
                </option>
              ))}
            </Select>
            <Select className="h-8 w-40 text-xs" value={companyRole} onChange={(e) => setCompanyRole(e.target.value as "COMPANY_ADMIN" | "PARTICIPANT")}>
              <option value="PARTICIPANT">Colaborador</option>
              <option value="COMPANY_ADMIN">Admin de empresa</option>
            </Select>
            <div className="flex gap-1">
              <Button size="sm" disabled={busy || !companyId} onClick={handleAssignCompany}>
                Asignar
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setAssigning(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setAssigning(true);
              if (suggestedCompany) setCompanyId(suggestedCompany.id);
            }}
          >
            Asignar a empresa
          </Button>
        )}
      </td>
      <td className="p-2">
        <Badge variant={user.status === "active" ? "success" : "danger"}>{user.status === "active" ? "Activa" : "Desactivada"}</Badge>
      </td>
      <td className="p-2">
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" disabled={busy} onClick={handleToggleStatus}>
            {user.status === "active" ? "Desactivar" : "Reactivar"}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={handleResetPassword}>
            Restablecer clave
          </Button>
          <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-bg" disabled={busy} onClick={handleDelete}>
            Eliminar
          </Button>
        </div>
        {rowError && <p className="mt-1 text-xs text-danger">{rowError}</p>}
      </td>
    </tr>
  );
}

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [globalRole, setGlobalRole] = useState("TEACHER");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; tempPassword: string | null } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await adminApi.createUser({ email, firstName, lastName, globalRole, password: password.trim() || undefined });
      setCreated({ email: result.email, tempPassword: result.tempPassword });
      setEmail("");
      setFirstName("");
      setLastName("");
      setPassword("");
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos crear la cuenta.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="self-start">
        + Crear cuenta
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <h2 className="font-serif text-lg font-semibold text-ink-900">Crear cuenta</h2>
        {created &&
          (created.tempPassword ? (
            <Callout variant="success">
              Cuenta creada para {created.email}. Contraseña temporal (solo se muestra esta vez):{" "}
              <code className="rounded bg-paper-muted px-1.5 py-0.5 font-mono">{created.tempPassword}</code>
            </Callout>
          ) : (
            <Callout variant="success">Cuenta creada para {created.email} con la contraseña que escribiste.</Callout>
          ))}
        {error && <Callout variant="danger">{error}</Callout>}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="new-user-first">Nombres</Label>
              <Input id="new-user-first" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="new-user-last">Apellidos</Label>
              <Input id="new-user-last" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="new-user-email">Correo</Label>
            <Input id="new-user-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="new-user-role">Rol</Label>
            <Select id="new-user-role" value={globalRole} onChange={(e) => setGlobalRole(e.target.value)}>
              {Object.entries(ROLE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="new-user-password">Contraseña (opcional)</Label>
            <Input
              id="new-user-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Déjalo vacío para generar una temporal"
            />
            <p className="mt-1 text-xs text-ash-500">Si la pones: mínimo 8 caracteres, con letra, número y un carácter especial (+ - * ! $ % &amp;).</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Creando…" : "Crear cuenta"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

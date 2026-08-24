"use client";

import { useEffect, useRef, useState } from "react";
import { adminApi, ApiError } from "@/lib/api-client";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

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
}

export function UsersManager() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [q, setQ] = useState("");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {error && <Callout variant="danger">{error}</Callout>}

      <CreateUserForm onCreated={() => refresh()} />

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <form
            className="flex gap-2"
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

          {loading ? (
            <p className="text-sm text-ash-500">Cargando…</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-ash-500">No se encontraron usuarios.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-paper-border text-ash-500">
                  <tr>
                    <th className="p-2 font-medium">Nombre</th>
                    <th className="p-2 font-medium">Correo</th>
                    <th className="p-2 font-medium">Rol</th>
                    <th className="p-2 font-medium">Firma</th>
                    <th className="p-2 font-medium">Estado</th>
                    <th className="p-2 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <UserRowItem key={u.id} user={u} onChange={() => refresh()} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UserRowItem({ user, onChange }: { user: UserRow; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);

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

  return (
    <tr className="border-b border-paper-border last:border-0">
      <td className="p-2">
        {user.firstName} {user.lastName}
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
        <Badge variant={user.status === "active" ? "success" : "danger"}>{user.status === "active" ? "Activa" : "Desactivada"}</Badge>
      </td>
      <td className="p-2">
        <Button size="sm" variant="ghost" disabled={busy} onClick={handleToggleStatus}>
          {user.status === "active" ? "Desactivar" : "Reactivar"}
        </Button>
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; tempPassword: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await adminApi.createUser({ email, firstName, lastName, globalRole });
      setCreated({ email: result.email, tempPassword: result.tempPassword });
      setEmail("");
      setFirstName("");
      setLastName("");
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
        {created && (
          <Callout variant="success">
            Cuenta creada para {created.email}. Contraseña temporal (solo se muestra esta vez):{" "}
            <code className="rounded bg-paper-muted px-1.5 py-0.5 font-mono">{created.tempPassword}</code>
          </Callout>
        )}
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

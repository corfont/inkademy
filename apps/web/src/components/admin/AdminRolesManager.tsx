"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_MODULES, type AdminPermissionLevel } from "@inkademy/shared";
import { adminApi, ApiError } from "@/lib/api-client";
import { getClientAccessToken } from "@/lib/auth";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  permissions: Record<string, AdminPermissionLevel>;
  active: boolean;
  users: { id: string; email: string; firstName: string; lastName: string }[];
};

const LEVEL_LABEL: Record<string, string> = { NONE: "Sin acceso", VIEW: "Solo ver", EDIT: "Ver y editar" };

function PermissionsEditor({ value, onChange }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  return (
    <div className="flex flex-col divide-y divide-paper-border rounded-md border border-paper-border">
      {ADMIN_MODULES.map((m) => (
        <div key={m.key} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-ink-900">{m.label}</p>
            <p className="text-xs text-ash-500">{m.description}</p>
          </div>
          <Select
            aria-label={`Permiso: ${m.label}`}
            className="sm:w-40"
            value={value[m.key] ?? "NONE"}
            onChange={(e) => {
              const next = { ...value };
              if (e.target.value === "NONE") delete next[m.key];
              else next[m.key] = e.target.value;
              onChange(next);
            }}
          >
            {Object.entries(LEVEL_LABEL).map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </Select>
        </div>
      ))}
    </div>
  );
}

/** Crear/editar roles de administrador por módulo y asignarlos a usuarios. */
export function AdminRolesManager({ roles }: { roles: RoleRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<Record<string, string>>({});
  const [assignEmail, setAssignEmail] = useState<Record<string, string>>({});
  // Las acciones que quitan acceso o borran piden confirmación antes de ejecutarse.
  const [confirm, setConfirm] = useState<{ title: string; message: string; label: string; danger?: boolean; action: () => Promise<unknown>; success: string } | null>(null);

  function startEdit(role: RoleRow | null) {
    setError(null);
    setOk(null);
    setEditing(role ? role.id : "new");
    // El formulario aparece arriba de la lista: se lleva la vista hasta él.
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    setName(role?.name ?? "");
    setDescription(role?.description ?? "");
    setPermissions({ ...(role?.permissions ?? {}) });
  }

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await action();
      setOk(success);
      setEditing(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo completar la acción.");
    } finally {
      setBusy(false);
    }
  }

  async function assign(role: RoleRow) {
    const email = (assignEmail[role.id] ?? "").trim().toLowerCase();
    if (!email) return;
    await run(async () => {
      const token = getClientAccessToken();
      const found = await adminApi.users({ q: email, pageSize: 20 }, token);
      const user = found.find((u: { email: string }) => u.email.toLowerCase() === email);
      if (!user) throw new ApiError(404, `No existe un usuario con el correo ${email}`);
      await adminApi.assignAdminRole(user.id, role.id, token);
      setAssignEmail((a) => ({ ...a, [role.id]: "" }));
    }, "Rol asignado.");
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Callout variant="danger">{error}</Callout>}
      {ok && <Callout variant="success">{ok}</Callout>}

      {editing ? (
        <Card>
          <CardContent className="flex flex-col gap-4 p-5">
            <h2 className="font-serif text-lg font-semibold text-ink-900">{editing === "new" ? "Nuevo rol" : "Editar rol"}</h2>
            <div>
              <Label htmlFor="role-name">Nombre del rol</Label>
              <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Finanzas, Soporte, Contenido" />
            </div>
            <div>
              <Label htmlFor="role-desc">Descripción (opcional)</Label>
              <Textarea id="role-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <PermissionsEditor value={permissions} onChange={setPermissions} />
            <div className="flex gap-2">
              <Button
                disabled={busy || name.trim().length < 2}
                onClick={() =>
                  run(
                    () =>
                      editing === "new"
                        ? adminApi.createAdminRole({ name: name.trim(), description: description.trim() || null, permissions }, getClientAccessToken())
                        : adminApi.updateAdminRole(editing, { name: name.trim(), description: description.trim() || null, permissions }, getClientAccessToken()),
                    "Rol guardado.",
                  )
                }
              >
                Guardar rol
              </Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div><Button onClick={() => startEdit(null)}>Crear un rol</Button></div>
      )}

      {roles.length === 0 && !editing && <p className="text-sm text-ash-500">Todavía no hay roles. Todos los administradores tienen acceso completo.</p>}

      {roles.map((role) => (
        <Card key={role.id}>
          <CardContent className="flex flex-col gap-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-ink-900">{role.name}</h3>
                <Badge variant={role.active ? "success" : "neutral"}>{role.active ? "Activo" : "Desactivado"}</Badge>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => startEdit(role)}>Editar</Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    const toggle = () => adminApi.updateAdminRole(role.id, { active: !role.active }, getClientAccessToken());
                    if (!role.active) return run(toggle, "Rol activado.");
                    setConfirm({ title: "Desactivar rol", message: `Las ${role.users.length} persona(s) con el rol «${role.name}» perderán el acceso al panel de administración hasta que lo actives otra vez.`, label: "Desactivar", danger: true, action: toggle, success: "Rol desactivado." });
                  }}
                >
                  {role.active ? "Desactivar" : "Activar"}
                </Button>
                <Button size="sm" variant="ghost" disabled={busy || role.users.length > 0} title={role.users.length > 0 ? "Quita primero a sus usuarios" : undefined} onClick={() => setConfirm({ title: "Eliminar rol", message: `Se eliminará el rol «${role.name}». Esta acción no se puede deshacer.`, label: "Eliminar", danger: true, action: () => adminApi.deleteAdminRole(role.id, getClientAccessToken()), success: "Rol eliminado." })}>
                  Eliminar
                </Button>
              </div>
            </div>
            {role.description && <p className="text-sm text-ash-600">{role.description}</p>}
            <ul className="flex flex-wrap gap-2">
              {ADMIN_MODULES.filter((m) => role.permissions[m.key]).map((m) => (
                <li key={m.key}><Badge variant={role.permissions[m.key] === "EDIT" ? "ink" : "outline"}>{m.label}: {role.permissions[m.key] === "EDIT" ? "editar" : "ver"}</Badge></li>
              ))}
              {Object.keys(role.permissions).length === 0 && <li className="text-sm text-ash-500">Sin acceso a ningún módulo.</li>}
            </ul>
            <div>
              <p className="mb-1 text-sm font-medium text-ink-900">Personas con este rol</p>
              {role.users.length === 0 ? (
                <p className="text-sm text-ash-500">Nadie todavía.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {role.users.map((u) => (
                    <li key={u.id} className="flex items-center justify-between text-sm">
                      <span>{u.firstName} {u.lastName} · <span className="text-ash-500">{u.email}</span></span>
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm({ title: "Quitar el rol", message: `${u.firstName} ${u.lastName} volverá a ser administrador COMPLETO, con acceso a todos los módulos.`, label: "Quitar rol", danger: true, action: () => adminApi.assignAdminRole(u.id, null, getClientAccessToken()), success: "Rol quitado: vuelve a ser administrador completo." })}>Quitar</Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex gap-2">
                <Input aria-label="Correo de la persona" placeholder="correo@empresa.com" value={assignEmail[role.id] ?? ""} onChange={(e) => setAssignEmail((a) => ({ ...a, [role.id]: e.target.value }))} />
                <Button size="sm" variant="outline" disabled={busy} onClick={() => assign(role)}>Asignar</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ""}
        message={confirm?.message ?? ""}
        confirmLabel={confirm?.label}
        danger={confirm?.danger}
        busy={busy}
        onConfirm={async () => {
          const c = confirm;
          if (!c) return;
          await run(c.action, c.success);
          setConfirm(null);
        }}
      />
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Ban, CheckCircle2, KeyRound, Trash2, Building2, UploadCloud, LayoutGrid, List as ListIcon, Pencil, Copy, Check } from "lucide-react";
import { adminApi, companyApi, ApiError } from "@/lib/api-client";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Dialog } from "@/components/ui/Dialog";
import { ROLE_STYLE, COMPANY_CHIP_STYLE } from "@/lib/role-style";
import { EditUserModal } from "@/components/admin/EditUserModal";

/**
 * "El administrador podría resetear la clave de cualquier usuario, inclusive
 * la de él mismo, pero no le debe preguntar la contraseña actual, solo poner
 * la nueva" — la API ya funcionaba así (resetUserPassword no pide ni valida
 * contraseña actual, y no bloquea el propio id). Lo que reemplaza este
 * diálogo es el prompt()/alert() nativos que usaba antes: frágiles (algunos
 * navegadores los bloquean), no se ven ni un poco "modernos" y no dejan
 * copiar la contraseña temporal con un clic.
 */
function ResetPasswordDialog({ user, open, onClose }: { user: UserRow; open: boolean; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ tempPassword?: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  function handleClose() {
    setPassword("");
    setBusy(false);
    setError(null);
    setResult(null);
    setCopied(false);
    onClose();
  }

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      const res = await adminApi.resetUserPassword(user.id, password.trim() || undefined);
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos restablecer la contraseña.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // portapapeles no disponible: el valor sigue visible en pantalla para copiarlo a mano
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} title={`Restablecer contraseña — ${user.firstName} ${user.lastName}`} className="max-w-md">
      {result ? (
        <div className="flex flex-col gap-3">
          <Callout variant="success">
            {result.tempPassword ? "Contraseña temporal generada. Solo se muestra esta vez — pásasela al usuario ahora." : "Contraseña actualizada correctamente."}
          </Callout>
          {result.tempPassword && (
            <div className="flex items-center gap-2 rounded-md border border-paper-border bg-paper-muted p-3">
              <code className="flex-1 select-all font-mono text-sm text-ink-900">{result.tempPassword}</code>
              <Button size="sm" variant="outline" onClick={() => handleCopy(result.tempPassword!)} className="gap-1.5">
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
          )}
          <Button size="sm" onClick={handleClose} className="self-end">
            Listo
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ash-500">
            Como administrador no necesitas la contraseña actual — solo define la nueva, o deja el campo vacío para generar una temporal automáticamente.
          </p>
          <div>
            <Label htmlFor="reset-pw">Nueva contraseña (opcional)</Label>
            <Input
              id="reset-pw"
              type="text"
              placeholder="Vacío = generar temporal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          {error && <Callout variant="danger">{error}</Callout>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={busy} onClick={handleClose}>
              Cancelar
            </Button>
            <Button size="sm" disabled={busy} onClick={handleSubmit}>
              {busy ? "Restableciendo…" : "Restablecer"}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

const ROLE_LABEL: Record<string, string> = { STUDENT: "Alumno", TEACHER: "Docente", SUPPORT: "Soporte", ADMIN: "Administrador" };
// Orden fijo de las chips de rol — coincide con el pedido explícito
// "Administrador, Docente, Empresa, Usuario" (empresa se muestra aparte,
// no es un globalRole).
const ROLE_ORDER = ["ADMIN", "TEACHER", "SUPPORT", "STUDENT"];

interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  globalRole: string;
  secondaryRoles: string[];
  status: string;
  createdAt: string;
  signatureAssetId?: string | null;
  signatureUrl?: string | null;
  companies?: { companyId: string; companyName: string; role: string }[];
  phone?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  jobTitle?: string | null;
  companyFreeText?: string | null;
  avatarUrl?: string | null;
  enrollmentStats?: { total: number; active: number; completed: number; group: "EN_CURSO" | "COMPLETADO" | "SIN_CURSOS" };
}

// "Semaforización": verde = completados, ámbar = en curso (pendientes de
// terminar), gris = sin ninguna matrícula todavía. Mismo dato que agrupa
// la vista "por progreso de cursos", solo que acá va por usuario.
const ENROLLMENT_GROUP_LABEL: Record<string, string> = {
  EN_CURSO: "Llevando un curso o más",
  COMPLETADO: "Culminó todo, nada pendiente",
  SIN_CURSOS: "Todavía sin cursos",
};

// "01. Admins en una sección, 02. Docentes en otra, 03. Soporte en otra,
// 04. Empresa (con sus trabajadores) en otra, 05. Público independiente en
// otra" — se secciona por el rol PRINCIPAL de cada cuenta (globalRole), no
// por los roles secundarios, para que cada usuario aparezca en una sola
// sección (un multi-rol ya se distingue con sus chips dentro de la fila).
type SectionKey = "ADMIN" | "TEACHER" | "SUPPORT" | "COMPANY" | "INDEPENDENT";
const SECTION_ORDER: SectionKey[] = ["ADMIN", "TEACHER", "SUPPORT", "COMPANY", "INDEPENDENT"];
const SECTION_LABEL: Record<SectionKey, string> = {
  ADMIN: "01. Administradores",
  TEACHER: "02. Docentes",
  SUPPORT: "03. Soporte",
  COMPANY: "04. Empresas (con sus colaboradores)",
  INDEPENDENT: "05. Público independiente",
};

function sectionFor(u: UserRow): SectionKey {
  if (u.globalRole === "ADMIN") return "ADMIN";
  if (u.globalRole === "TEACHER") return "TEACHER";
  if (u.globalRole === "SUPPORT") return "SUPPORT";
  return u.companies && u.companies.length > 0 ? "COMPANY" : "INDEPENDENT";
}

function emailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

/**
 * Calcula el próximo {globalRole, secondaryRoles} al hacer click en una
 * chip de rol — toggle real de multi-rol: "un docente podría ser también
 * alumno, administrador y soporte al mismo tiempo". Si se quita el rol
 * PRINCIPAL (globalRole) y quedan otros roles activos, se promueve el
 * primero de ellos a principal; no se permite quedarse sin ningún rol.
 */
function toggleRole(user: UserRow, role: string): { globalRole: string; secondaryRoles: string[] } | null {
  const active = [user.globalRole, ...user.secondaryRoles];
  const isActive = active.includes(role);
  if (isActive) {
    const remaining = active.filter((r) => r !== role);
    if (remaining.length === 0) return null; // debe quedar al menos un rol
    if (role === user.globalRole) {
      const [newPrimary, ...rest] = remaining;
      return { globalRole: newPrimary, secondaryRoles: rest };
    }
    return { globalRole: user.globalRole, secondaryRoles: remaining.filter((r) => r !== user.globalRole) };
  }
  return { globalRole: user.globalRole, secondaryRoles: [...user.secondaryRoles, role] };
}

export function UsersManager() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [groupMode, setGroupMode] = useState<"type" | "domain" | "progress">("type");
  const [view, setView] = useState<"grid" | "list">("grid");
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

  // Vista por defecto: seccionada por tipo de cuenta — "01. Admins en una
  // sección, 02. Docentes en otra, 03. Soporte en otra, 04. Empresa (con
  // sus trabajadores) en otra, 05. Público independiente en otra". Dentro
  // de la sección Empresas se sub-agrupa por empresa (ya es "con sus
  // trabajadores": el admin de la empresa y sus colaboradores juntos).
  //
  // Vista alternativa (checkbox): agrupar TODOS por dominio de correo,
  // ignorando el rol — sirve para ubicar de un vistazo a quienes
  // probablemente sean de la misma empresa (p.ej. @corporacionandina.com)
  // ANTES de asignarlos a una empresa real, algo que la vista por rol no
  // puede mostrar (todavía no tienen `companies`, así que caen en "Público
  // independiente" mezclados con alumnos sueltos).
  // Vista alternativa (progreso de cursos): "los que están llevando un
  // curso o más, los que ya culminaron y no están llevando nada, los que
  // aún no han llevado ninguno" — mismo dato que el semáforo de cada
  // recuadro, agrupado esta vez a nivel de toda la lista.
  const PROGRESS_ORDER = ["EN_CURSO", "COMPLETADO", "SIN_CURSOS"] as const;

  const groups: Array<{ domain: string; label: string; rows: UserRow[] }> =
    groupMode === "domain"
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
      : groupMode === "progress"
        ? PROGRESS_ORDER.flatMap((g) => {
            const rows = users.filter((u) => (u.enrollmentStats?.group ?? "SIN_CURSOS") === g);
            if (rows.length === 0) return [];
            return [{ domain: g, label: ENROLLMENT_GROUP_LABEL[g], rows }];
          })
        : SECTION_ORDER.flatMap((section) => {
        const rows = users.filter((u) => sectionFor(u) === section);
        if (rows.length === 0) return [];
        if (section !== "COMPANY") return [{ domain: section, label: SECTION_LABEL[section], rows }];
        const byCompany = new Map<string, UserRow[]>();
        for (const u of rows) {
          const name = u.companies?.[0]?.companyName ?? "Empresa";
          (byCompany.get(name) ?? byCompany.set(name, []).get(name)!).push(u);
        }
        return Array.from(byCompany.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([name, companyRows]) => ({ domain: `${section}-${name}`, label: `${SECTION_LABEL[section]} — ${name}`, rows: companyRows }));
      });

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
              Agrupar por
              <Select className="h-8 w-56 text-xs" value={groupMode} onChange={(e) => setGroupMode(e.target.value as typeof groupMode)}>
                <option value="type">Tipo de cuenta</option>
                <option value="domain">Dominio de correo</option>
                <option value="progress">Progreso de cursos</option>
              </Select>
            </label>
            <div className="flex overflow-hidden rounded-md border border-paper-border">
              <button
                type="button"
                onClick={() => setView("grid")}
                title="Ver como galería"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium ${view === "grid" ? "bg-ink-900 text-paper" : "bg-paper text-ash-600 hover:bg-paper-muted"}`}
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Galería
              </button>
              <button
                type="button"
                onClick={() => setView("list")}
                title="Ver como lista"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium ${view === "list" ? "bg-ink-900 text-paper" : "bg-paper text-ash-600 hover:bg-paper-muted"}`}
              >
                <ListIcon className="h-3.5 w-3.5" /> Lista
              </button>
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-ash-500">Cargando…</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-ash-500">No se encontraron usuarios.</p>
          ) : (
            <div className="flex flex-col gap-6">
              {groups.map((group) => (
                <div key={group.domain || "all"}>
                  {group.label && (
                    <p className="mb-3 inline-block rounded bg-paper-muted px-2 py-1 text-xs font-semibold text-ash-600">
                      {group.label} ({group.rows.length})
                    </p>
                  )}
                  {view === "grid" ? (
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {group.rows.map((u) => (
                        <UserCard key={u.id} user={u} companies={companies} onChange={() => refresh()} />
                      ))}
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-paper-border">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-paper-border text-ash-500">
                          <tr>
                            <th className="p-3 font-medium">Nombre</th>
                            <th className="p-3 font-medium">Roles</th>
                            <th className="p-3 font-medium">Empresa</th>
                            <th className="p-3 font-medium">Cursos</th>
                            <th className="p-3 font-medium">Estado</th>
                            <th className="p-3 font-medium">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-paper-border">
                          {group.rows.map((u) => (
                            <UserListRow key={u.id} user={u} companies={companies} onChange={() => refresh()} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RoleChips({ user, busy, onToggle }: { user: UserRow; busy: boolean; onToggle: (role: string) => void }) {
  const active = [user.globalRole, ...user.secondaryRoles];
  return (
    <>
      {ROLE_ORDER.map((role) => {
        const style = ROLE_STYLE[role];
        const isActive = active.includes(role);
        const isPrimary = role === user.globalRole;
        return (
          <button
            key={role}
            type="button"
            disabled={busy}
            onClick={() => onToggle(role)}
            title={isPrimary ? `Rol principal: ${style.label}` : isActive ? `Quitar rol ${style.label}` : `Agregar rol ${style.label}`}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
              isActive ? style.chipActive : style.chip
            } ${isPrimary ? "ring-2 ring-offset-1 ring-ink-400" : ""}`}
          >
            <style.icon className="h-3 w-3" aria-hidden="true" />
            {style.label}
          </button>
        );
      })}
    </>
  );
}

/**
 * "En cada recuadro podría haber un indicador del total de cursos
 * matriculados vs completados vs pendientes de finalizar, como si fuera
 * una semaforización... que se vea profesional y bello." Tres números con
 * un punto de color cada uno: gris (total), verde (completados), ámbar
 * (en curso/pendientes de terminar) — de un vistazo, sin entrar al detalle.
 */
function EnrollmentSemaphore({ stats }: { stats?: { total: number; active: number; completed: number } }) {
  if (!stats || stats.total === 0) {
    return <span className="text-xs text-ash-400">Sin cursos matriculados todavía</span>;
  }
  return (
    <div className="flex items-center gap-3 text-xs text-ash-600" title="Cursos matriculados · completados · en curso (pendientes de terminar)">
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-ash-400" aria-hidden="true" />
        {stats.total} matriculado{stats.total === 1 ? "" : "s"}
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
        {stats.completed} completado{stats.completed === 1 ? "" : "s"}
      </span>
      <span className="flex items-center gap-1">
        <span className="h-2 w-2 rounded-full bg-warning" aria-hidden="true" />
        {stats.active} en curso
      </span>
    </div>
  );
}

function UserCard({ user, companies, onChange }: { user: UserRow; companies: any[]; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [editing, setEditing] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
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

  async function handleToggleRole(role: string) {
    const next = toggleRole(user, role);
    if (!next) return; // debe quedar al menos un rol
    setBusy(true);
    setRowError(null);
    try {
      await adminApi.updateUser(user.id, next);
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

  const hasCompany = Boolean(user.companies && user.companies.length > 0);
  const isTeacher = user.globalRole === "TEACHER" || user.secondaryRoles.includes("TEACHER");

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Avatar name={`${user.firstName} ${user.lastName}`} src={user.avatarUrl} />
            <div>
              <p className="font-serif font-semibold leading-tight text-ink-900">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-ash-500">{user.email}</p>
            </div>
          </div>
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
              user.status === "active" ? "bg-success-bg text-success" : "bg-danger-bg text-danger"
            }`}
          >
            {user.status === "active" ? <CheckCircle2 className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
            {user.status === "active" ? "Activa" : "Desactivada"}
          </span>
        </div>

        {/* Rol — chips multi-select: "un docente podría ser también alumno,
            administrador y soporte al mismo tiempo". El rol con el anillo
            resaltado es el "principal" (decide a qué panel entra por
            defecto); los demás son adicionales. Empresa se muestra como
            chip aparte porque es una afiliación independiente. */}
        <div className="flex flex-wrap gap-1.5">
          <RoleChips user={user} busy={busy} onToggle={handleToggleRole} />
          {hasCompany ? (
            user.companies!.map((c) => (
              <span
                key={c.companyId}
                title={`${c.role === "COMPANY_ADMIN" ? "Admin de empresa" : "Colaborador"}`}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${COMPANY_CHIP_STYLE.chipActive}`}
              >
                <COMPANY_CHIP_STYLE.icon className="h-3 w-3" aria-hidden="true" />
                {c.companyName}
              </span>
            ))
          ) : (
            <button
              type="button"
              onClick={() => {
                setAssigning((v) => !v);
                if (suggestedCompany) setCompanyId(suggestedCompany.id);
              }}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${COMPANY_CHIP_STYLE.chip}`}
            >
              <Building2 className="h-3 w-3" aria-hidden="true" />
              Empresa
            </button>
          )}
        </div>

        {assigning && !hasCompany && (
          <div className="flex flex-col gap-1.5 rounded-md bg-paper-muted p-2.5">
            <Select className="h-8 text-xs" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">Elegir empresa…</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.legalName}
                </option>
              ))}
            </Select>
            <Select className="h-8 text-xs" value={companyRole} onChange={(e) => setCompanyRole(e.target.value as "COMPANY_ADMIN" | "PARTICIPANT")}>
              <option value="PARTICIPANT">Colaborador</option>
              <option value="COMPANY_ADMIN">Admin de empresa</option>
            </Select>
            <div className="flex gap-1.5">
              <Button size="sm" disabled={busy || !companyId} onClick={handleAssignCompany}>
                Asignar
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => setAssigning(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}

        <EnrollmentSemaphore stats={user.enrollmentStats} />

        {isTeacher && (
          <div className="flex items-center gap-2 rounded-md bg-paper-muted p-2.5">
            {user.signatureUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={user.signatureUrl} alt="Firma" className="h-8 w-16 rounded border border-paper-border bg-paper object-contain" />
                <span className="text-xs text-ash-500">Firma para certificados</span>
                <Button size="sm" variant="ghost" className="ml-auto" disabled={busy} onClick={handleSignatureRemove}>
                  Quitar
                </Button>
              </>
            ) : (
              <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-ink-700 hover:underline">
                <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
                Subir firma para certificados
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  disabled={busy}
                  onChange={(e) => e.target.files?.[0] && handleSignatureUpload(e.target.files[0])}
                />
              </label>
            )}
          </div>
        )}

        {rowError && <p className="text-xs text-danger">{rowError}</p>}

        <div className="flex flex-wrap gap-1.5 border-t border-paper-border pt-3">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(true)} className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={handleToggleStatus} className="gap-1.5">
            {user.status === "active" ? <Ban className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {user.status === "active" ? "Desactivar" : "Reactivar"}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setResetOpen(true)} className="gap-1.5">
            <KeyRound className="h-3.5 w-3.5" />
            Restablecer
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 text-danger hover:bg-danger-bg" disabled={busy} onClick={handleDelete}>
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar
          </Button>
        </div>
      </CardContent>
      {editing && <EditUserModal user={user} open={editing} onClose={() => setEditing(false)} onSaved={onChange} />}
      <ResetPasswordDialog user={user} open={resetOpen} onClose={() => setResetOpen(false)} />
    </Card>
  );
}

/** Misma lógica que UserCard, en fila de tabla compacta — "debe darme la opción también de verlo como lista". */
function UserListRow({ user, companies: _companies, onChange }: { user: UserRow; companies: any[]; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  async function handleToggleRole(role: string) {
    const next = toggleRole(user, role);
    if (!next) return;
    setBusy(true);
    setRowError(null);
    try {
      await adminApi.updateUser(user.id, next);
      onChange();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "No pudimos cambiar el rol.");
      setBusy(false);
    }
  }

  async function handleToggleStatus() {
    const next = user.status === "active" ? "disabled" : "active";
    if (next === "disabled" && !confirm(`¿Desactivar la cuenta de ${user.email}?`)) return;
    setBusy(true);
    try {
      await adminApi.updateUser(user.id, { status: next });
      onChange();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "No pudimos cambiar el estado.");
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar la cuenta de ${user.email}?`)) return;
    setBusy(true);
    try {
      await adminApi.deleteUser(user.id);
      onChange();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : "No pudimos eliminar la cuenta.");
      setBusy(false);
    }
  }

  return (
    <tr className="transition-colors hover:bg-paper-muted">
      <td className="p-3">
        <div className="flex items-center gap-2">
          <Avatar name={`${user.firstName} ${user.lastName}`} size="sm" src={user.avatarUrl} />
          <div>
            <p className="font-medium text-ink-900">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-xs text-ash-500">{user.email}</p>
          </div>
        </div>
        {rowError && <p className="mt-1 text-xs text-danger">{rowError}</p>}
      </td>
      <td className="p-3">
        <div className="flex flex-wrap gap-1">
          <RoleChips user={user} busy={busy} onToggle={handleToggleRole} />
        </div>
      </td>
      <td className="p-3 text-xs text-ash-600">{user.companies?.map((c) => c.companyName).join(", ") || "—"}</td>
      <td className="p-3">
        <EnrollmentSemaphore stats={user.enrollmentStats} />
      </td>
      <td className="p-3">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${user.status === "active" ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>
          {user.status === "active" ? "Activa" : "Desactivada"}
        </span>
      </td>
      <td className="p-3">
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(true)}>
            Editar
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={handleToggleStatus}>
            {user.status === "active" ? "Desactivar" : "Reactivar"}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setResetOpen(true)}>
            Restablecer
          </Button>
          <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-bg" disabled={busy} onClick={handleDelete}>
            Eliminar
          </Button>
        </div>
        {editing && <EditUserModal user={user} open={editing} onClose={() => setEditing(false)} onSaved={onChange} />}
        <ResetPasswordDialog user={user} open={resetOpen} onClose={() => setResetOpen(false)} />
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

import type { Metadata } from "next";
import Link from "next/link";
import { adminApi, type AdminUsersPage } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken, getServerUserRoles } from "@/lib/server-auth";
import { flattenParams, listHref, type RawSearchParams } from "@/lib/list-state";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Input";
import { ExportButtons } from "@/components/data/ExportButtons";
import { FilterBar, FilterField } from "@/components/data/FilterBar";
import { Pagination } from "@/components/data/Pagination";
import { UsersManager } from "@/components/admin/UsersManager";

export const metadata: Metadata = { title: "Usuarios y roles" };

const BASE = "/admin/usuarios";
const FILTER_KEYS = ["q", "role", "status", "from", "to"];
const EMPTY: AdminUsersPage = { rows: [], total: 0, page: 1, pageSize: 50, sort: "created", dir: "desc" };

const SORT_OPTIONS: [string, string][] = [
  ["created", "Fecha de alta"],
  ["name", "Apellido y nombre"],
  ["email", "Correo"],
  ["status", "Estado"],
];

export default async function AdminUsersPage({ searchParams }: { searchParams: RawSearchParams }) {
  const accessToken = getServerAccessToken();
  const params = flattenParams(searchParams);
  const isAdmin = getServerUserRoles().includes("ADMIN");

  const [{ data: result }, { data: companies }] = await Promise.all([
    withFallback(() => adminApi.usersSearch(params, accessToken), EMPTY),
    // Lista secundaria (para asignar a una empresa desde la tarjeta): si falla, la página sigue.
    withFallback(() => adminApi.companies(accessToken), [] as any[], { soft: true }),
  ]);

  const filtersActive = FILTER_KEYS.some((k) => params[k]);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));

  const empty =
    result.total > 0 ? (
      <EmptyState
        title="Esta página no tiene resultados"
        description={`Hay ${pages} ${pages === 1 ? "página" : "páginas"} de resultados.`}
        action={<Link href={listHref(BASE, params, { page: undefined })} className="text-sm font-medium text-indigo-600 hover:underline">Ir a la primera página</Link>}
      />
    ) : filtersActive ? (
      <EmptyState
        title="No hay usuarios con estos filtros"
        description="Prueba con otro nombre, rol o rango de fechas."
        action={<Link href={BASE} className="text-sm font-medium text-indigo-600 hover:underline">Limpiar filtros</Link>}
      />
    ) : (
      <EmptyState title="Todavía no hay usuarios" description="Crea la primera cuenta con el formulario de arriba." />
    );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink-900">Usuarios y roles</h1>
          <p className="mt-1 max-w-3xl text-sm text-ash-500">
            Busca cualquier cuenta, crea una nueva (docente, soporte, otro administrador), cambia su rol o desactiva/reactiva su acceso.
          </p>
        </div>
        {isAdmin && <ExportButtons path="users/export" params={params} />}
      </div>

      <FilterBar basePath={BASE} params={params} filterKeys={FILTER_KEYS} keepSort={false}>
        <FilterField label="Buscar (nombre o correo)" htmlFor="f-q">
          <Input id="f-q" name="q" defaultValue={params.q ?? ""} placeholder="Ej.: ana quispe o ana@correo.com" className="w-72" />
        </FilterField>
        <FilterField label="Rol" htmlFor="f-role">
          <Select id="f-role" name="role" defaultValue={params.role ?? ""} className="w-40">
            <option value="">Todos</option>
            <option value="ADMIN">Administrador</option>
            <option value="TEACHER">Docente</option>
            <option value="SUPPORT">Soporte</option>
            <option value="STUDENT">Alumno</option>
            <option value="COMPANY">Empresa</option>
          </Select>
        </FilterField>
        <FilterField label="Estado" htmlFor="f-status">
          <Select id="f-status" name="status" defaultValue={params.status ?? ""} className="w-36">
            <option value="">Todos</option>
            <option value="active">Activa</option>
            <option value="disabled">Desactivada</option>
          </Select>
        </FilterField>
        <FilterField label="Alta desde" htmlFor="f-from">
          <Input id="f-from" type="date" name="from" defaultValue={params.from ?? ""} className="w-40" />
        </FilterField>
        <FilterField label="Alta hasta" htmlFor="f-to">
          <Input id="f-to" type="date" name="to" defaultValue={params.to ?? ""} className="w-40" />
        </FilterField>
        <FilterField label="Ordenar por" htmlFor="f-sort">
          <Select id="f-sort" name="sort" defaultValue={result.sort} className="w-44">
            {SORT_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Sentido" htmlFor="f-dir">
          <Select id="f-dir" name="dir" defaultValue={result.dir} className="w-36">
            <option value="desc">Descendente</option>
            <option value="asc">Ascendente</option>
          </Select>
        </FilterField>
      </FilterBar>

      <UsersManager users={result.rows} companies={companies} empty={empty} />

      <Pagination basePath={BASE} params={params} page={result.page} pageSize={result.pageSize} total={result.total} />
    </div>
  );
}

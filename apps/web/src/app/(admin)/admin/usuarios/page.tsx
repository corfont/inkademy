import type { Metadata } from "next";
import { UsersManager } from "@/components/admin/UsersManager";

export const metadata: Metadata = { title: "Usuarios y roles" };

export default function AdminUsersPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Usuarios y roles</h1>
        <p className="mt-1 text-sm text-ash-500">
          Busca cualquier cuenta, crea una nueva (docente, soporte, otro administrador), cambia su rol o
          desactiva/reactiva su acceso.
        </p>
      </div>
      <UsersManager />
    </div>
  );
}

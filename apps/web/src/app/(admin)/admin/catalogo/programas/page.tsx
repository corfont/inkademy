import type { Metadata } from "next";
import { adminApi } from "@/lib/api-client";
import { getServerAccessToken } from "@/lib/server-auth";
import { ProgramManager } from "@/components/admin/ProgramManager";

export const metadata: Metadata = { title: "Programas y diplomados" };

export default async function AdminProgramsPage() {
  const accessToken = getServerAccessToken();
  const [programs, courses] = await Promise.all([adminApi.programs(accessToken), adminApi.courses(accessToken)]);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Programas y diplomados</h1>
        <p className="mt-1 text-sm text-ash-500">
          Un programa agrupa varios cursos existentes con un precio y certificación propios.
        </p>
      </div>
      <ProgramManager programs={programs} courses={courses} />
    </div>
  );
}

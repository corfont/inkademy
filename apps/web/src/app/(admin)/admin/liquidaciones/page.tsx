import type { Metadata } from "next";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { TeacherPayrollManager } from "@/components/admin/TeacherPayrollManager";
import { Callout } from "@/components/ui/Callout";

export const metadata: Metadata = { title: "Liquidación de docentes (admin)" };

export default async function TeacherPayrollPage() {
  const accessToken = getServerAccessToken();
  const { data: teachers, live } = await withFallback(() => adminApi.users({ role: "TEACHER" }, accessToken), [] as any[]);
  const { data: courses } = await withFallback(() => adminApi.courses(accessToken), [] as any[]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Liquidación de docentes</h1>
        <p className="mt-1 text-sm text-ash-500">
          Tarifa por hora de dictado y otras actividades, tolerancia por tardanza/salida temprana, adelantos, y liquidación por periodo — solo
          para docentes que cobran (si es un docente de planta que no cobra tarifa por hora, simplemente no le configures ninguna).
        </p>
      </div>
      {!live && <Callout variant="info">No pudimos conectar con la API — no se muestran docentes reales por ahora.</Callout>}
      <TeacherPayrollManager teachers={teachers} courses={courses} />
    </div>
  );
}

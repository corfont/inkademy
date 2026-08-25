import type { Metadata } from "next";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { TeacherSessionHoursReport } from "@/components/admin/TeacherSessionHoursReport";
import { Callout } from "@/components/ui/Callout";

export const metadata: Metadata = { title: "Horas dictadas por docente (admin)" };

export default async function TeacherSessionHoursPage() {
  const accessToken = getServerAccessToken();
  const { data: teachers, live } = await withFallback(() => adminApi.users({ role: "TEACHER" }, accessToken), [] as any[]);
  const { data: courses } = await withFallback(() => adminApi.courses(accessToken), [] as any[]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Horas dictadas por docente</h1>
        <p className="mt-1 text-sm text-ash-500">
          Hora de conexión y desconexión de cada clase en vivo, y el balance de horas dictadas por sesión, por docente y por curso — la misma base
          que usa la liquidación de docentes para calcular descuentos por tardanza o salida temprana.
        </p>
      </div>
      {!live && <Callout variant="info">No pudimos conectar con la API — no se muestran docentes reales por ahora.</Callout>}
      <TeacherSessionHoursReport teachers={teachers} courses={courses} />
    </div>
  );
}

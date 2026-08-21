import type { Metadata } from "next";
import { cookies } from "next/headers";
import { meApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { buildMockClassroom, MOCK_COURSES } from "@/lib/mock-data";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth";
import { Classroom } from "@/components/campus/Classroom";
import { Callout } from "@/components/ui/Callout";

export const metadata: Metadata = { title: "Aula" };

const ENROLLMENT_TO_SLUG: Record<string, string> = {
  e1: "liderazgo-equipos-remotos",
  e2: "analisis-de-datos-con-power-bi",
  e3: "finanzas-para-no-financieros",
};

export default async function ClassroomPage({ params }: { params: { enrollmentId: string } }) {
  const accessToken = cookies().get(ACCESS_TOKEN_COOKIE)?.value ?? null;
  const slug = ENROLLMENT_TO_SLUG[params.enrollmentId] ?? MOCK_COURSES[0].slug;

  const { data: detail, live } = await withFallback(
    () => meApi.enrollment(params.enrollmentId, accessToken),
    buildMockClassroom(params.enrollmentId, slug),
  );

  return (
    <div className="mx-auto max-w-6xl">
      {!live && (
        <Callout variant="info" className="mb-6">
          Mostrando datos de referencia; no pudimos conectar con la API.
        </Callout>
      )}
      <Classroom detail={detail} />
    </div>
  );
}

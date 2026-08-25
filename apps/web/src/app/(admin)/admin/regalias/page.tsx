import type { Metadata } from "next";
import { adminApi } from "@/lib/api-client";
import { getServerAccessToken } from "@/lib/server-auth";
import { RoyaltyRecipientManager } from "@/components/admin/RoyaltyRecipientManager";

export const metadata: Metadata = { title: "Regalías (admin)" };

export default async function RoyaltyRecipientsPage() {
  const accessToken = getServerAccessToken();
  const [recipients, courses] = await Promise.all([adminApi.royaltyRecipients(accessToken), adminApi.courses(accessToken)]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Regalías</h1>
        <p className="mt-1 text-sm text-ash-500">
          Cursos que pagan un % o monto por alumno matriculado, por alumno que termina, o por referido — a alguien que no es usuario de la
          plataforma.
        </p>
      </div>
      <RoyaltyRecipientManager recipients={recipients} courses={courses} />
    </div>
  );
}

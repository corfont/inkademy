import type { Metadata } from "next";
import { adminApi } from "@/lib/api-client";
import { getServerAccessToken } from "@/lib/server-auth";
import { PartnerInstitutionManager } from "@/components/admin/PartnerInstitutionManager";

export const metadata: Metadata = { title: "Convenios institucionales (admin)" };

export default async function PartnerInstitutionsPage() {
  const accessToken = getServerAccessToken();
  const [institutions, courses] = await Promise.all([adminApi.partnerInstitutions(accessToken), adminApi.courses(accessToken)]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Convenios institucionales</h1>
        <p className="mt-1 text-sm text-ash-500">
          Institutos/universidades con convenio: agregan una tercera firma al certificado y pueden cobrar un fijo, por curso dictado o por un
          plazo.
        </p>
      </div>
      <PartnerInstitutionManager institutions={institutions} courses={courses} />
    </div>
  );
}

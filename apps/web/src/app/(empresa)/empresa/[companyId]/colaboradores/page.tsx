import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { companyApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { InviteCollaboratorForm } from "@/components/empresa/InviteCollaboratorForm";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";

export const metadata: Metadata = { title: "Colaboradores" };

interface MemberLike {
  id: string;
  name: string;
  email: string;
  role: "COMPANY_ADMIN" | "PARTICIPANT";
  team?: string | null;
  status: "INVITED" | "ACTIVE" | "REMOVED";
}

const MOCK_MEMBERS: MemberLike[] = [
  { id: "m1", name: "Valeria Ochoa", email: "valeria.ochoa@andina.pe", role: "COMPANY_ADMIN", team: "RRHH", status: "ACTIVE" },
  { id: "m2", name: "Jorge Nina", email: "jorge.nina@andina.pe", role: "PARTICIPANT", team: "Comercial", status: "ACTIVE" },
  { id: "m3", name: "Paola Reyes", email: "paola.reyes@andina.pe", role: "PARTICIPANT", team: "Comercial", status: "INVITED" },
];

export default async function CollaboratorsPage({ params }: { params: { companyId: string } }) {
  const t = await getTranslations("empresa.collaborators");

  const { data: members, live } = await withFallback(() => companyApi.members(params.companyId), MOCK_MEMBERS);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-ink-900">{t("title")}</h1>
        <InviteCollaboratorForm companyId={params.companyId} />
      </div>
      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      <div className="overflow-x-auto rounded-lg border border-paper-border bg-paper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-paper-border text-ash-500">
            <tr>
              <th className="p-4 font-medium">Nombre</th>
              <th className="p-4 font-medium">{t("email")}</th>
              <th className="p-4 font-medium">{t("team")}</th>
              <th className="p-4 font-medium">{t("role")}</th>
              <th className="p-4 font-medium">{t("status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-border">
            {members.map((member: MemberLike) => (
              <tr key={member.id}>
                <td className="p-4 font-medium text-ink-900">{member.name}</td>
                <td className="p-4 text-ash-600">{member.email}</td>
                <td className="p-4 text-ash-600">{member.team ?? "—"}</td>
                <td className="p-4">
                  <Badge variant={member.role === "COMPANY_ADMIN" ? "ink" : "outline"}>{member.role}</Badge>
                </td>
                <td className="p-4">
                  <Badge variant={member.status === "ACTIVE" ? "success" : member.status === "INVITED" ? "warning" : "neutral"}>
                    {member.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

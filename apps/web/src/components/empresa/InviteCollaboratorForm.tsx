"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { inviteCollaboratorSchema, type InviteCollaboratorInput } from "@inkademy/shared";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { companyApi } from "@/lib/api-client";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Dialog } from "@/components/ui/Dialog";

export function InviteCollaboratorForm({ companyId }: { companyId: string }) {
  const t = useTranslations("empresa.collaborators");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<InviteCollaboratorInput>({
    resolver: zodResolver(inviteCollaboratorSchema),
    defaultValues: { role: "PARTICIPANT" },
  });

  async function onSubmit(values: InviteCollaboratorInput) {
    setError(null);
    try {
      await companyApi.inviteMember(companyId, values);
      reset();
      setOpen(false);
      router.refresh();
    } catch {
      setError("No pudimos enviar la invitación. Intenta nuevamente.");
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>{t("invite")}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t("invite")}>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {error && <Callout variant="danger">{error}</Callout>}
          <div>
            <Label htmlFor="email">{t("email")}</Label>
            <Input id="email" type="email" required {...register("email")} />
          </div>
          <div>
            <Label htmlFor="role">{t("role")}</Label>
            <Select id="role" {...register("role")}>
              <option value="PARTICIPANT">Participante</option>
              <option value="COMPANY_ADMIN">Administrador de empresa</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="team">{t("team")}</Label>
            <Input id="team" placeholder="Ej. Comercial Lima" {...register("team")} />
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "…" : t("invite")}
          </Button>
        </form>
      </Dialog>
    </>
  );
}

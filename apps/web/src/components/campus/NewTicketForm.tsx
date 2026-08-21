"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createSupportTicketSchema, type CreateSupportTicketInput } from "@inkademy/shared";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { supportApi } from "@/lib/api-client";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Dialog } from "@/components/ui/Dialog";

export function NewTicketForm() {
  const t = useTranslations("campus.support");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<CreateSupportTicketInput>({
    resolver: zodResolver(createSupportTicketSchema),
    defaultValues: { priority: "MEDIUM" },
  });

  async function onSubmit(values: CreateSupportTicketInput) {
    setError(null);
    try {
      await supportApi.createTicket(values);
      reset();
      setOpen(false);
      router.refresh();
    } catch {
      setError("No pudimos crear el ticket. Intenta nuevamente.");
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>{t("newTicket")}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={t("newTicket")}>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {error && <Callout variant="danger">{error}</Callout>}
          <div>
            <Label htmlFor="category">{t("category")}</Label>
            <Select id="category" {...register("category")}>
              <option value="acceso">Acceso a la plataforma</option>
              <option value="certificados">Certificados</option>
              <option value="pagos">Pagos y facturación</option>
              <option value="contenido">Contenido del curso</option>
              <option value="otro">Otro</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="subject">{t("subject")}</Label>
            <Input id="subject" required {...register("subject")} />
          </div>
          <div>
            <Label htmlFor="priority">{t("priority")}</Label>
            <Select id="priority" {...register("priority")}>
              <option value="LOW">Baja</option>
              <option value="MEDIUM">Media</option>
              <option value="HIGH">Alta</option>
              <option value="URGENT">Urgente</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="body">{t("description")}</Label>
            <Textarea id="body" required {...register("body")} />
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "…" : t("submit")}
          </Button>
        </form>
      </Dialog>
    </>
  );
}

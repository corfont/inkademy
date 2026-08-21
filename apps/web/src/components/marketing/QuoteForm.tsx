"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { requestQuoteSchema, type RequestQuoteInput } from "@inkademy/shared";
import { useTranslations } from "next-intl";
import { companyApi } from "@/lib/api-client";
import { Input, Label, FieldError, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";

export function QuoteForm() {
  const t = useTranslations("companies.form");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<RequestQuoteInput>({ resolver: zodResolver(requestQuoteSchema) });

  async function onSubmit(values: RequestQuoteInput) {
    try {
      // No hay companyId todavía (empresa aún no registrada en la plataforma);
      // el backend crea la Company + Quote a partir de estos datos.
      await companyApi.requestQuote("new", values);
      setStatus("success");
      reset();
    } catch {
      setStatus("error");
    }
  }

  if (status === "success") {
    return <Callout variant="success">{t("success")}</Callout>;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {status === "error" && <Callout variant="danger">No pudimos enviar tu solicitud. Intenta nuevamente.</Callout>}
      <div>
        <Label htmlFor="legalName">{t("legalName")}</Label>
        <Input id="legalName" error={errors.legalName?.message} {...register("legalName")} />
        <FieldError>{errors.legalName?.message}</FieldError>
      </div>
      <div>
        <Label htmlFor="taxId">{t("taxId")}</Label>
        <Input id="taxId" error={errors.taxId?.message} {...register("taxId")} />
        <FieldError>{errors.taxId?.message}</FieldError>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="contactEmail">{t("contactEmail")}</Label>
          <Input id="contactEmail" type="email" error={errors.contactEmail?.message} {...register("contactEmail")} />
          <FieldError>{errors.contactEmail?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="contactPhone">{t("contactPhone")}</Label>
          <Input id="contactPhone" {...register("contactPhone")} />
        </div>
      </div>
      <div>
        <Label htmlFor="offeringDescription">{t("offeringDescription")}</Label>
        <Textarea
          id="offeringDescription"
          placeholder={t("offeringDescriptionPlaceholder")}
          error={errors.offeringDescription?.message}
          {...register("offeringDescription")}
        />
        <FieldError>{errors.offeringDescription?.message}</FieldError>
      </div>
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? "…" : t("submit")}
      </Button>
    </form>
  );
}

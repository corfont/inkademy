"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { publicQuoteRequestSchema, type PublicQuoteRequestInput } from "@inkademy/shared";
import { useTranslations } from "next-intl";
import { companyApi } from "@/lib/api-client";
import { Input, Label, FieldError, Select, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";

const SEATS_LABEL: Record<string, string> = {
  "1-10": "1 a 10 personas",
  "11-50": "11 a 50 personas",
  "51-200": "51 a 200 personas",
  "200+": "Más de 200 personas",
};

/** Formulario público de /empresas: no pide sesión; el equipo comercial recibe un aviso y el contacto se registra en el CRM. */
export function QuoteForm({ interests = [] }: { interests?: string[] }) {
  const t = useTranslations("companies.form");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<PublicQuoteRequestInput>({
    resolver: zodResolver(publicQuoteRequestSchema),
    defaultValues: { taxIdType: "RUC", seatsRange: "11-50", interest: "" },
  });
  const taxIdType = watch("taxIdType");

  async function onSubmit(values: PublicQuoteRequestInput) {
    try {
      await companyApi.publicQuoteRequest(values);
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
      {status === "error" && <Callout variant="danger">No pudimos enviar tu solicitud. Revisa los datos e intenta nuevamente.</Callout>}
      <div>
        <Label htmlFor="legalName">{t("legalName")}</Label>
        <Input id="legalName" error={errors.legalName?.message} {...register("legalName")} />
        <FieldError>{errors.legalName?.message}</FieldError>
      </div>
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <div>
          <Label htmlFor="taxIdType">Documento</Label>
          <Select id="taxIdType" {...register("taxIdType")}>
            <option value="RUC">RUC (Perú)</option>
            <option value="OTRO">Otro país</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="taxId">{taxIdType === "RUC" ? "Número de RUC" : "Identificación tributaria"}</Label>
          <Input id="taxId" inputMode="numeric" error={errors.taxId?.message} {...register("taxId")} />
          <FieldError>{errors.taxId?.message}</FieldError>
        </div>
      </div>
      <div>
        <Label htmlFor="contactName">Tu nombre</Label>
        <Input id="contactName" autoComplete="name" error={errors.contactName?.message} {...register("contactName")} />
        <FieldError>{errors.contactName?.message}</FieldError>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="contactEmail">{t("contactEmail")}</Label>
          <Input id="contactEmail" type="email" error={errors.contactEmail?.message} {...register("contactEmail")} />
          <FieldError>{errors.contactEmail?.message}</FieldError>
        </div>
        <div>
          <Label htmlFor="contactPhone">{t("contactPhone")}</Label>
          <Input id="contactPhone" type="tel" {...register("contactPhone")} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="seatsRange">¿A cuántas personas quieren capacitar?</Label>
          <Select id="seatsRange" {...register("seatsRange")}>
            {Object.entries(SEATS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="interest">¿Qué les interesa?</Label>
          <Select id="interest" {...register("interest")}>
            <option value="">Aún no lo sé / varios temas</option>
            {interests.map((title) => (
              <option key={title} value={title}>{title}</option>
            ))}
            <option value="Otro tema">Otro tema</option>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="message">{t("offeringDescription")}</Label>
        <Textarea id="message" placeholder={t("offeringDescriptionPlaceholder")} error={errors.message?.message} {...register("message")} />
        <FieldError>{errors.message?.message}</FieldError>
      </div>
      {/* Campo trampa para bots: fuera de pantalla y sin tabulación. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          No llenar
          <input type="text" tabIndex={-1} autoComplete="off" {...register("website")} />
        </label>
      </div>
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? "…" : t("submit")}
      </Button>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterInput } from "@inkademy/shared";
import { useTranslations, useLocale } from "next-intl";
import { useAuth } from "@/components/providers/AuthProvider";
import { ApiError } from "@/lib/api-client";
import { Input, Label, FieldError } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

export default function RegisterPage() {
  const t = useTranslations("auth.register");
  const locale = useLocale() as "es" | "en";
  const { register: doRegister } = useAuth();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { locale, marketingConsentEmail: false },
  });

  async function onSubmit(values: RegisterInput) {
    setServerError(null);
    try {
      await doRegister(values);
      router.push("/completar-perfil");
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "No pudimos crear tu cuenta.");
    }
  }

  return (
    <Card>
      <CardContent className="p-8">
        <h1 className="font-serif text-2xl font-semibold text-ink-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-ash-600">{t("subtitle")}</p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          {serverError && <Callout variant="danger">{serverError}</Callout>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="firstName">{t("firstName")}</Label>
              <Input id="firstName" autoComplete="given-name" error={errors.firstName?.message} {...register("firstName")} />
              <FieldError>{errors.firstName?.message}</FieldError>
            </div>
            <div>
              <Label htmlFor="lastName">{t("lastName")}</Label>
              <Input id="lastName" autoComplete="family-name" error={errors.lastName?.message} {...register("lastName")} />
              <FieldError>{errors.lastName?.message}</FieldError>
            </div>
          </div>
          <div>
            <Label htmlFor="email">{t("email")}</Label>
            <Input id="email" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
            <FieldError>{errors.email?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="password">{t("password")}</Label>
            <Input id="password" type="password" autoComplete="new-password" error={errors.password?.message} {...register("password")} />
            <p className="mt-1 text-xs text-ash-500">{t("passwordHint")}</p>
            <FieldError>{errors.password?.message}</FieldError>
          </div>
          <Checkbox id="marketingConsentEmail" label={t("marketingConsent")} {...register("marketingConsentEmail")} />
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? "…" : t("submit")}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-ash-600">
          {t("hasAccount")}{" "}
          <Link href="/login" className="font-medium text-ink-700 hover:underline">
            {t("signIn")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

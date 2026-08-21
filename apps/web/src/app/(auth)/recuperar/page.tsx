"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { authApi } from "@/lib/api-client";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

export default function RecoverPasswordPage() {
  const t = useTranslations("auth.recover");
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<{ email: string }>();

  async function onSubmit(values: { email: string }) {
    try {
      await authApi.forgotPassword(values.email);
    } catch {
      // Por seguridad, no revelamos si el correo existe o no.
    } finally {
      setSent(true);
    }
  }

  return (
    <Card>
      <CardContent className="p-8">
        <h1 className="font-serif text-2xl font-semibold text-ink-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-ash-600">{t("subtitle")}</p>

        {sent ? (
          <Callout variant="success" className="mt-6">
            {t("success")}
          </Callout>
        ) : (
          <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div>
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" type="email" required autoComplete="email" {...register("email", { required: true })} />
            </div>
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? "…" : t("submit")}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="font-medium text-ink-700 hover:underline">
            {t("backToLogin")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { authApi, ApiError } from "@/lib/api-client";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

/**
 * Destino del enlace enviado por POST /auth/forgot-password (ver
 * notification.service.ts). Antes de esto, POST /auth/reset-password
 * existía y funcionaba en el API, pero no había ninguna pantalla que lo
 * consumiera — el enlace del correo no llevaba a ningún lado.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const t = useTranslations("auth.resetPassword");
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<{ password: string }>();

  async function onSubmit(values: { password: string }) {
    if (!token) return;
    setServerError(null);
    try {
      await authApi.resetPassword({ token, password: values.password });
      setSuccess(true);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : t("invalidToken"));
    }
  }

  if (!token) {
    return (
      <Card>
        <CardContent className="p-8">
          <Callout variant="danger">{t("invalidToken")}</Callout>
          <p className="mt-6 text-center text-sm">
            <Link href="/recuperar" className="font-medium text-ink-700 hover:underline">
              {t("requestNewLink")}
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-8">
        <h1 className="font-serif text-2xl font-semibold text-ink-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-ash-600">{t("subtitle")}</p>

        {success ? (
          <>
            <Callout variant="success" className="mt-6">
              {t("success")}
            </Callout>
            <p className="mt-6 text-center text-sm">
              <Link href="/login" className="font-medium text-ink-700 hover:underline">
                {t("goToLogin")}
              </Link>
            </p>
          </>
        ) : (
          <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            {serverError && <Callout variant="danger">{serverError}</Callout>}
            <div>
              <Label htmlFor="password">{t("password")}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                {...register("password", { required: true, minLength: 8 })}
              />
              <p className="mt-1 text-xs text-ash-500">{t("passwordHint")}</p>
            </div>
            <Button type="submit" size="lg" disabled={isSubmitting}>
              {isSubmitting ? "…" : t("submit")}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

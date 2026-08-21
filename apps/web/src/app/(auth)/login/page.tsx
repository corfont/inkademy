"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@inkademy/shared";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/providers/AuthProvider";
import { ApiError, API_URL } from "@/lib/api-client";
import { Input, Label, FieldError } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const t = useTranslations("auth.login");
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginInput) {
    setServerError(null);
    try {
      const user = await login(values.email, values.password);
      const next = searchParams.get("next");
      if (!user.profileCompletedAt) {
        router.push("/completar-perfil");
      } else {
        router.push(next ?? "/campus");
      }
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "No pudimos iniciar sesión.");
    }
  }

  return (
    <Card>
      <CardContent className="p-8">
        <h1 className="font-serif text-2xl font-semibold text-ink-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-ash-600">{t("subtitle")}</p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          {serverError && <Callout variant="danger">{serverError}</Callout>}
          <div>
            <Label htmlFor="email">{t("email")}</Label>
            <Input id="email" type="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
            <FieldError>{errors.email?.message}</FieldError>
          </div>
          <div>
            <Label htmlFor="password">{t("password")}</Label>
            <Input id="password" type="password" autoComplete="current-password" error={errors.password?.message} {...register("password")} />
            <FieldError>{errors.password?.message}</FieldError>
          </div>
          <div className="text-right">
            <Link href="/recuperar" className="text-sm text-ink-700 hover:underline">
              {t("forgot")}
            </Link>
          </div>
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? "…" : t("submit")}
          </Button>
        </form>

        <div className="mt-6 flex items-center gap-3 text-xs uppercase tracking-wide text-ash-400">
          <span className="h-px flex-1 bg-paper-border" />
          {t("orContinueWith")}
          <span className="h-px flex-1 bg-paper-border" />
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <a href={`${API_URL}/auth/google`}>
            <Button type="button" variant="outline" className="w-full">
              {t("google")}
            </Button>
          </a>
          <a href={`${API_URL}/auth/microsoft`}>
            <Button type="button" variant="outline" className="w-full">
              {t("microsoft")}
            </Button>
          </a>
        </div>

        <p className="mt-6 text-center text-sm text-ash-600">
          {t("noAccount")}{" "}
          <Link href="/registro" className="font-medium text-ink-700 hover:underline">
            {t("createAccount")}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

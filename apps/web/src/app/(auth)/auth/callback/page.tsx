"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { authApi } from "@/lib/api-client";
import { persistSession } from "@/lib/auth";
import { useAuth } from "@/components/providers/AuthProvider";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

// Destino de /auth/google/callback y /auth/microsoft/callback en la API:
// APP_URL/auth/callback?code=<códigoDeIntercambio> — un código de un solo
// uso (~60s), no el accessToken crudo (ver REVIEW.md #2.2: el token en la
// URL quedaba en historial/logs/Referer). Se canjea acá mismo por el token
// real antes de hacer nada más.
export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <OAuthCallbackInner />
    </Suspense>
  );
}

function OAuthCallbackInner() {
  const t = useTranslations("auth.callback");
  const searchParams = useSearchParams();
  const router = useRouter();
  const { setUser } = useAuth();
  const [error, setError] = useState(false);

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      setError(true);
      return;
    }
    authApi
      .exchangeOAuthCode(code)
      .then(({ accessToken: token }) =>
        authApi.me(token).then((user) => {
          persistSession(user, token);
          setUser(user);
          router.push(user.profileCompletedAt ? "/campus" : "/completar-perfil");
        }),
      )
      .catch(() => setError(true));
  }, [searchParams, router, setUser]);

  return (
    <Card>
      <CardContent className="p-8 text-center">
        {error ? <Callout variant="danger">{t("error")}</Callout> : <p className="text-ash-600">{t("processing")}</p>}
      </CardContent>
    </Card>
  );
}

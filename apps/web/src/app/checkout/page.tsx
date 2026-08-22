"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import type { CourseCardDTO, ProgramDetailDTO } from "@inkademy/shared";
import { catalogApi, commerceApi, ApiError } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { MOCK_COURSES, MOCK_PROGRAM } from "@/lib/mock-data";
import { useAuth } from "@/components/providers/AuthProvider";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";
import { localize, formatPrice } from "@/lib/format";

// NOTA: la integración real de pago (Culqi Checkout / Stripe Elements) requiere
// cargar su script del proveedor y tokenizar la tarjeta en el cliente antes de
// enviar `paymentMethodToken` a POST /checkout (ver docs/API-CONTRACT.md).
// Como aquí no hay llaves públicas reales ni red garantizada, este formulario
// simula esa tokenización localmente (genera un token ficticio) para que el
// flujo de compra sea end-to-end navegable en desarrollo.
function fakeTokenize(cardNumber: string) {
  return `tok_test_${cardNumber.slice(-4)}_${Date.now()}`;
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={null}>
      <CheckoutForm />
    </Suspense>
  );
}

function CheckoutForm() {
  const t = useTranslations("checkout");
  const tc = useTranslations("common");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  const courseId = searchParams.get("courseId");
  const programId = searchParams.get("programId");

  const [course, setCourse] = useState<CourseCardDTO | null>(null);
  const [program, setProgram] = useState<ProgramDetailDTO | null>(null);
  const [asCompany, setAsCompany] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [card, setCard] = useState({ number: "", expiry: "", cvc: "", name: "" });
  const [status, setStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (courseId) {
      const mock = MOCK_COURSES.find((c) => c.id === courseId) ?? MOCK_COURSES[0];
      withFallback(
        () => catalogApi.courses({ page: 1, pageSize: 50 }).then((r) => r.items.find((c) => c.id === courseId) ?? mock),
        mock,
      ).then(({ data }) => setCourse(data));
    } else if (programId) {
      const mock = programId === MOCK_PROGRAM.id ? MOCK_PROGRAM : MOCK_PROGRAM;
      withFallback(() => catalogApi.program(mock.slug), mock).then(({ data }) => setProgram(data));
    }
  }, [courseId, programId]);

  const currency = course?.priceCurrency ?? program?.priceCurrency ?? "PEN";
  const amount = course?.priceAmount ?? program?.priceAmount ?? "0";
  const title = course ? localize(course.title, locale) : program ? localize(program.title, locale) : "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("processing");
    setErrorMessage(null);
    try {
      const result = await commerceApi.checkout({
        items: [
          {
            offeringKind: course ? "COURSE" : "PROGRAM",
            courseId: course?.id,
            programId: program?.id,
          },
        ],
        currency: currency as "PEN" | "USD",
        paymentProvider: "CULQI",
        companyId: asCompany && companyId ? companyId : undefined,
        paymentMethodToken: fakeTokenize(card.number || "4111111111111111"),
      });
      setStatus("success");
      setTimeout(() => router.push(`/campus/pagos?orderId=${result.orderId}`), 1200);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof ApiError ? err.message : t("error"));
    }
  }

  if (!course && !program) {
    return (
      <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-4 py-16 text-center">
        <p className="text-ash-600">{t("empty")}</p>
        <Link href="/catalogo">
          <Button>{t("goToCatalog")}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper-muted">
      <header className="container flex h-16 items-center">
        <Image src="/brand/logo-horizontal.png" alt="Inkademy" width={643} height={200} className="h-8 w-auto" />
      </header>

      <div className="container grid gap-8 pb-16 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-6">
          <h1 className="font-serif text-2xl font-semibold text-ink-900">{t("title")}</h1>

          {status === "success" ? (
            <Callout variant="success">{t("success")}</Callout>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              {status === "error" && errorMessage && <Callout variant="danger">{errorMessage}</Callout>}

              <Card>
                <CardContent className="p-6">
                  <h2 className="font-serif text-lg font-semibold text-ink-900">{t("billingTitle")}</h2>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="fullName">{tc("teacher") === "Docente" ? "Nombre completo" : "Full name"}</Label>
                      <Input id="fullName" defaultValue={user ? `${user.firstName} ${user.lastName}` : ""} required />
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input id="email" type="email" defaultValue={user?.email ?? ""} required />
                    </div>
                  </div>
                  <label className="mt-4 flex items-center gap-2 text-sm text-ash-600">
                    <input type="checkbox" checked={asCompany} onChange={(e) => setAsCompany(e.target.checked)} />
                    {t("asCompany")}
                  </label>
                  {asCompany && (
                    <div className="mt-3">
                      <Label htmlFor="companyId">Company ID</Label>
                      <Input id="companyId" value={companyId} onChange={(e) => setCompanyId(e.target.value)} placeholder="uuid" />
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <h2 className="flex items-center gap-2 font-serif text-lg font-semibold text-ink-900">
                    <Lock className="h-4 w-4 text-ash-400" aria-hidden="true" />
                    {t("paymentTitle")}
                  </h2>
                  <Callout variant="info" className="mt-3">
                    {t("testCardNotice")}
                  </Callout>
                  <div className="mt-4 grid gap-4">
                    <div>
                      <Label htmlFor="cardName">{t("cardName")}</Label>
                      <Input id="cardName" required value={card.name} onChange={(e) => setCard((c) => ({ ...c, name: e.target.value }))} />
                    </div>
                    <div>
                      <Label htmlFor="cardNumber">{t("cardNumber")}</Label>
                      <Input
                        id="cardNumber"
                        inputMode="numeric"
                        required
                        placeholder="4111 1111 1111 1111"
                        value={card.number}
                        onChange={(e) => setCard((c) => ({ ...c, number: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="cardExpiry">{t("cardExpiry")}</Label>
                        <Input
                          id="cardExpiry"
                          required
                          placeholder="12/29"
                          value={card.expiry}
                          onChange={(e) => setCard((c) => ({ ...c, expiry: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label htmlFor="cardCvc">{t("cardCvc")}</Label>
                        <Input
                          id="cardCvc"
                          required
                          inputMode="numeric"
                          value={card.cvc}
                          onChange={(e) => setCard((c) => ({ ...c, cvc: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Button type="submit" size="lg" disabled={status === "processing"}>
                {status === "processing" ? t("processing") : `${t("pay")} ${formatPrice(amount, currency, locale)}`}
              </Button>
            </form>
          )}
        </div>

        <aside>
          <Card>
            <CardContent className="p-6">
              <h2 className="mb-4 font-serif text-lg font-semibold text-ink-900">{t("cartTitle")}</h2>
              <p className="text-sm font-medium text-ink-900">{title}</p>
              <div className="mt-4 flex justify-between border-t border-paper-border pt-4 text-sm">
                <span className="text-ash-600">{t("subtotal")}</span>
                <span>{formatPrice(amount, currency, locale)}</span>
              </div>
              <div className="mt-2 flex justify-between text-base font-semibold text-ink-900">
                <span>{t("total")}</span>
                <span>{formatPrice(amount, currency, locale)}</span>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

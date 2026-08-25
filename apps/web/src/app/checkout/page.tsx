"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import type { CourseCardDTO, ProgramDetailDTO } from "@inkademy/shared";
import { catalogApi, commerceApi, authApi, ApiError } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { MOCK_COURSES, MOCK_PROGRAM } from "@/lib/mock-data";
import { useAuth } from "@/components/providers/AuthProvider";
import { useBrandSettings } from "@/components/providers/BrandSettingsProvider";
import { isCulqiConfigured, openCulqiCheckout } from "@/lib/culqi";
import { Input, Label, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";
import { localize, formatPrice } from "@/lib/format";

// Alternativa cuando NO hay llave pública de Culqi configurada (dev sin
// credenciales reales) — antes esto era la ÚNICA forma de "pagar", sin
// importar si había credenciales o no. Ahora, con NEXT_PUBLIC_CULQI_PUBLIC_KEY
// configurada, el checkout abre el widget real de Culqi (tarjeta + Yape) en
// vez de este formulario simulado — ver apps/web/src/lib/culqi.ts.
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
  const brand = useBrandSettings();

  const courseId = searchParams.get("courseId");
  const programId = searchParams.get("programId");
  // Presentes cuando se llega desde "Comprar más cupos" en
  // /empresa/:id/cupos — antes el checkout solo sabía comprar 1 curso/
  // programa para una sola persona, sin forma de comprar cupos B2B por
  // cantidad (el backend ya soportaba seatPoolQty en /checkout, pero
  // ninguna pantalla lo usaba).
  const seatPoolQtyParam = searchParams.get("seatPoolQty");
  const companyIdParam = searchParams.get("companyId");
  const seatPoolQty = seatPoolQtyParam ? Math.max(1, Number(seatPoolQtyParam) || 1) : null;

  const [course, setCourse] = useState<CourseCardDTO | null>(null);
  const [program, setProgram] = useState<ProgramDetailDTO | null>(null);
  const [asCompany, setAsCompany] = useState(Boolean(companyIdParam));
  const [companyId, setCompanyId] = useState(companyIdParam ?? "");
  const [card, setCard] = useState({ number: "", expiry: "", cvc: "", name: "" });
  const [buyer, setBuyer] = useState({
    documentType: "1" as "1" | "6" | "4" | "7" | "0",
    documentNumber: "",
    legalName: user ? `${user.firstName} ${user.lastName}` : "",
    country: "PE",
  });
  const [status, setStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [documentNumberAutofilled, setDocumentNumberAutofilled] = useState(false);

  // Si el alumno ya tiene DNI cargado en su perfil, se autocompleta acá en
  // vez de pedírselo de nuevo — antes documentNumber siempre arrancaba
  // vacío aunque `GET /profile` ya lo tuviera. Solo autocompleta mientras
  // el comprador no haya tocado el campo a mano (no pisa una edición suya).
  useEffect(() => {
    authApi
      .getFullProfile()
      .then((profile) => {
        if (profile.documentType === "DNI" && profile.documentNumber) {
          setBuyer((b) => (b.documentNumber ? b : { ...b, documentType: "1", documentNumber: profile.documentNumber! }));
          setDocumentNumberAutofilled(true);
        }
      })
      .catch(() => {
        // sin sesión o perfil incompleto — el comprador lo escribe a mano, como antes
      });
  }, []);

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
  const unitAmount = Number(course?.priceAmount ?? program?.priceAmount ?? "0");
  const amount = seatPoolQty ? unitAmount * seatPoolQty : unitAmount;
  const title = course ? localize(course.title, locale) : program ? localize(program.title, locale) : "";

  // El widget real de Culqi (tarjeta + Yape) solo aplica a soles (PEN) y
  // solo si hay llave pública configurada — sin eso, se mantiene el
  // formulario simulado de antes para que el flujo siga siendo navegable
  // en desarrollo. Stripe (USD) no cambia en este pedido.
  const useCulqiWidget = currency === "PEN" && isCulqiConfigured();

  // "El precio que ponemos ya incluye todos los tributos" — desglose
  // informativo para el comprador, no cambia ningún monto: si la
  // plataforma está EXONERADA de IGV (default para enseñanza reglada, Ley
  // del IGV Apéndice II) el precio final ES la base imponible; si está
  // GRAVADA, se separa base + IGV(18%) del mismo precio final — antes esto
  // era invisible para el comprador (Order.tax siempre se guardaba en 0).
  const isGravado = brand.taxAffectation === "GRAVADO";
  const baseAmount = isGravado ? amount / 1.18 : amount;
  const igvAmount = isGravado ? amount - baseAmount : 0;

  async function getPaymentToken(): Promise<string> {
    if (useCulqiWidget) {
      const result = await openCulqiCheckout({
        amountInCents: Math.round(amount * 100),
        currency: "PEN",
        title: "Inkademy",
        description: title,
        email: user?.email,
      });
      return result.token;
    }
    return fakeTokenize(card.number || "4111111111111111");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("processing");
    setErrorMessage(null);
    try {
      const paymentMethodToken = await getPaymentToken();
      const result = await commerceApi.checkout({
        items: [
          {
            offeringKind: course ? "COURSE" : "PROGRAM",
            courseId: course?.id,
            programId: program?.id,
            seatPoolQty: seatPoolQty ?? undefined,
          },
        ],
        currency: currency as "PEN" | "USD",
        // Antes siempre mandaba "CULQI" sin importar la moneda — Culqi es
        // para rieles peruanos (PEN); un curso en USD (comprador
        // internacional) debe ir por Stripe, que es el adapter pensado para
        // eso (ver CommerceService / docs de arquitectura).
        paymentProvider: currency === "USD" ? "STRIPE" : "CULQI",
        companyId: asCompany && companyId ? companyId : undefined,
        paymentMethodToken,
        // Si compra a nombre de empresa, el backend usa el RUC de la
        // empresa para la factura y estos campos se ignoran.
        ...(asCompany
          ? {}
          : {
              buyerDocumentType: buyer.documentType,
              buyerDocumentNumber: buyer.documentNumber,
              buyerLegalName: buyer.legalName,
              buyerCountry: buyer.country,
            }),
      });
      setStatus("success");
      setTimeout(() => router.push(`/campus/pagos?orderId=${result.orderId}`), 1200);
    } catch (err) {
      setStatus("error");
      // Errores de openCulqiCheckout (widget cerrado, tarjeta rechazada, etc.)
      // llegan como Error normal, no ApiError — mostrar su mensaje real en
      // vez de el genérico ayuda al comprador a entender qué pasó.
      setErrorMessage(err instanceof ApiError ? err.message : err instanceof Error ? err.message : t("error"));
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
        <BrandLogo />
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
                    <input
                      type="checkbox"
                      checked={asCompany}
                      disabled={Boolean(companyIdParam)}
                      onChange={(e) => setAsCompany(e.target.checked)}
                    />
                    {t("asCompany")}
                  </label>
                  {asCompany && (
                    <div className="mt-3">
                      <Label htmlFor="companyId">Company ID</Label>
                      <Input
                        id="companyId"
                        value={companyId}
                        disabled={Boolean(companyIdParam)}
                        onChange={(e) => setCompanyId(e.target.value)}
                        placeholder="uuid"
                      />
                    </div>
                  )}
                  {seatPoolQty && (
                    <Callout variant="info" className="mt-3">
                      Estás comprando {seatPoolQty} cupo{seatPoolQty === 1 ? "" : "s"} para colaboradores de tu empresa.
                    </Callout>
                  )}
                </CardContent>
              </Card>

              {!asCompany && (
                <Card>
                  <CardContent className="p-6">
                    <h2 className="font-serif text-lg font-semibold text-ink-900">{t("invoiceTitle")}</h2>
                    <p className="mt-1 text-sm text-ash-500">{t("invoiceHint")}</p>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label htmlFor="documentType">{t("documentType")}</Label>
                        <Select
                          id="documentType"
                          value={buyer.documentType}
                          onChange={(e) => setBuyer((b) => ({ ...b, documentType: e.target.value as typeof b.documentType }))}
                        >
                          <option value="1">{t("documentType_1")}</option>
                          <option value="6">{t("documentType_6")}</option>
                          <option value="4">{t("documentType_4")}</option>
                          <option value="7">{t("documentType_7")}</option>
                          <option value="0">{t("documentType_0")}</option>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="documentNumber">{t("documentNumber")}</Label>
                        <Input
                          id="documentNumber"
                          required
                          value={buyer.documentNumber}
                          onChange={(e) => {
                            setDocumentNumberAutofilled(false);
                            setBuyer((b) => ({ ...b, documentNumber: e.target.value }));
                          }}
                        />
                        {documentNumberAutofilled && buyer.documentType === "1" && (
                          <p className="mt-1 text-xs text-ash-500">Autocompletado desde tu perfil.</p>
                        )}
                      </div>
                      <div className="sm:col-span-2">
                        <Label htmlFor="legalName">{t("legalName")}</Label>
                        <Input
                          id="legalName"
                          required
                          value={buyer.legalName}
                          onChange={(e) => setBuyer((b) => ({ ...b, legalName: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label htmlFor="buyerCountry">{t("country")}</Label>
                        <Input
                          id="buyerCountry"
                          required
                          maxLength={2}
                          value={buyer.country}
                          onChange={(e) => setBuyer((b) => ({ ...b, country: e.target.value.toUpperCase() }))}
                        />
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-ash-500">
                      {isGravado
                        ? `Precio final ${formatPrice(amount, currency, locale)} — incluye base imponible ${formatPrice(baseAmount, currency, locale)} + IGV (18%) ${formatPrice(igvAmount, currency, locale)}.`
                        : "Este servicio educativo está exonerado de IGV (Ley del IGV, Apéndice II) — el precio final no lleva impuesto agregado."}{" "}
                      El precio que ves ya incluye todos los tributos y gastos; no se te cobrará nada adicional.
                    </p>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent className="p-6">
                  <h2 className="flex items-center gap-2 font-serif text-lg font-semibold text-ink-900">
                    <Lock className="h-4 w-4 text-ash-400" aria-hidden="true" />
                    {t("paymentTitle")}
                  </h2>
                  {useCulqiWidget ? (
                    <p className="mt-3 text-sm text-ash-600">
                      Al continuar se abrirá la ventana segura de Culqi — ahí puedes pagar con tarjeta, Yape o Plin, según lo que tengas
                      habilitado. Inkademy no ve ni guarda tu tarjeta.
                    </p>
                  ) : (
                    <>
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
                    </>
                  )}
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
              {seatPoolQty && (
                <p className="mt-1 text-xs text-ash-500">
                  {formatPrice(unitAmount, currency, locale)} × {seatPoolQty} cupos
                </p>
              )}
              <div className="mt-4 flex justify-between border-t border-paper-border pt-4 text-sm">
                <span className="text-ash-600">{isGravado ? "Base imponible" : t("subtotal")}</span>
                <span>{formatPrice(baseAmount, currency, locale)}</span>
              </div>
              {isGravado && (
                <div className="mt-1 flex justify-between text-sm">
                  <span className="text-ash-600">IGV (18%)</span>
                  <span>{formatPrice(igvAmount, currency, locale)}</span>
                </div>
              )}
              {!isGravado && <p className="mt-1 text-xs text-success">Exonerado de IGV</p>}
              <div className="mt-2 flex justify-between border-t border-paper-border pt-2 text-base font-semibold text-ink-900">
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

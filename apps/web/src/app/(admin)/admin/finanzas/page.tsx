import type { Metadata } from "next";
import { TrendingUp, Receipt, CreditCard, Wallet, Scale } from "lucide-react";
import { getLocale } from "next-intl/server";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { Card, CardContent } from "@/components/ui/Card";
import { Callout } from "@/components/ui/Callout";
import { ExpenseManager } from "@/components/admin/ExpenseManager";
import { FeeSettingsForm } from "@/components/admin/FeeSettingsForm";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Finanzas (admin)" };

const MOCK_SUMMARY = {
  from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  to: new Date().toISOString(),
  taxAffectation: "EXONERADO" as const,
  culqiFeePercent: 3.99,
  stripeFeePercent: 4.99,
  rows: [{ currency: "PEN", income: 0, igv: 0, providerFees: 0, otherExpenses: 0, balance: 0 }],
};

export default async function AdminFinancePage() {
  const locale = await getLocale();
  const accessToken = getServerAccessToken();
  const [{ data: summary, live: liveSummary }, { data: expenses, live: liveExpenses }] = await Promise.all([
    withFallback(() => adminApi.financialSummary({}, accessToken), MOCK_SUMMARY),
    withFallback(() => adminApi.expenses({}, accessToken), [] as any[]),
  ]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Finanzas</h1>
        <p className="mt-1 text-sm text-ash-500">
          Últimos 30 días · {summary.taxAffectation === "GRAVADO" ? "Plataforma afecta a IGV (18%)" : "Plataforma exonerada de IGV"}
        </p>
      </div>
      {(!liveSummary || !liveExpenses) && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      {summary.rows.map((row: any) => (
        <section key={row.currency} className="flex flex-col gap-4">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Balance en {row.currency}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardContent className="p-5">
                <TrendingUp className="h-5 w-5 text-success" aria-hidden="true" />
                <p className="mt-3 font-serif text-xl font-semibold text-ink-900">{formatPrice(row.income, row.currency, locale)}</p>
                <p className="text-sm text-ash-500">Ingresos</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <Receipt className="h-5 w-5 text-warning" aria-hidden="true" />
                <p className="mt-3 font-serif text-xl font-semibold text-ink-900">{formatPrice(row.igv, row.currency, locale)}</p>
                <p className="text-sm text-ash-500">IGV a pagar a SUNAT</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <CreditCard className="h-5 w-5 text-ink-700" aria-hidden="true" />
                <p className="mt-3 font-serif text-xl font-semibold text-ink-900">{formatPrice(row.providerFees, row.currency, locale)}</p>
                <p className="text-sm text-ash-500">Comisión Culqi/Stripe</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <Wallet className="h-5 w-5 text-ash-500" aria-hidden="true" />
                <p className="mt-3 font-serif text-xl font-semibold text-ink-900">{formatPrice(row.otherExpenses, row.currency, locale)}</p>
                <p className="text-sm text-ash-500">Otros gastos</p>
              </CardContent>
            </Card>
            <Card className={row.balance >= 0 ? "border-success" : "border-danger"}>
              <CardContent className="p-5">
                <Scale className={`h-5 w-5 ${row.balance >= 0 ? "text-success" : "text-danger"}`} aria-hidden="true" />
                <p className={`mt-3 font-serif text-xl font-semibold ${row.balance >= 0 ? "text-success" : "text-danger"}`}>
                  {formatPrice(row.balance, row.currency, locale)}
                </p>
                <p className="text-sm text-ash-500">Saldo total</p>
              </CardContent>
            </Card>
          </div>
        </section>
      ))}

      <section>
        <h2 className="mb-3 font-serif text-lg font-semibold text-ink-900">Comisión estimada de pasarela</h2>
        <FeeSettingsForm culqiFeePercent={summary.culqiFeePercent} stripeFeePercent={summary.stripeFeePercent} />
        <p className="mt-2 text-xs text-ash-500">
          Ajusta esto al % real que te cobra Culqi/Stripe según tu contrato comercial — el cálculo del saldo se actualiza al instante.
        </p>
      </section>

      <section>
        <h2 className="mb-3 font-serif text-lg font-semibold text-ink-900">Otros gastos</h2>
        <ExpenseManager expenses={expenses} locale={locale} />
      </section>
    </div>
  );
}

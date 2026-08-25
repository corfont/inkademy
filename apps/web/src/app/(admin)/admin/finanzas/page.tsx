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
import { ProfitAndLossCharts } from "@/components/admin/ProfitAndLossCharts";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Finanzas (admin)" };

const MOCK_SUMMARY = {
  from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  to: new Date().toISOString(),
  taxAffectation: "EXONERADO" as const,
  igvPercent: 18,
  culqiFeePercent: 3.99,
  stripeFeePercent: 4.99,
  detractionEnabled: false,
  detractionPercent: 0,
  rows: [{ currency: "PEN", income: 0, igv: 0, detraction: 0, providerFees: 0, otherExpenses: 0, balance: 0 }],
};

const MOCK_PNL = {
  months: [{ month: new Date().toISOString().slice(0, 7), income: 0, expenses: 0, profit: 0 }],
  monthlyFixedCosts: 0,
  variableRatePercent: 0,
  breakEvenIncome: null as number | null,
  avgGrowthPct: null as number | null,
  forecastNextMonth: null as number | null,
  status: "EQUILIBRIO" as const,
};

export default async function AdminFinancePage() {
  const locale = await getLocale();
  const accessToken = getServerAccessToken();
  const [{ data: summary, live: liveSummary }, { data: expenses, live: liveExpenses }, { data: pnl, live: livePnl }] = await Promise.all([
    withFallback(() => adminApi.financialSummary({}, accessToken), MOCK_SUMMARY),
    withFallback(() => adminApi.expenses({}, accessToken), [] as any[]),
    withFallback(() => adminApi.profitAndLoss(6, accessToken), MOCK_PNL),
  ]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Finanzas</h1>
        <p className="mt-1 text-sm text-ash-500">
          Últimos 30 días · {summary.taxAffectation === "GRAVADO" ? `Plataforma afecta a IGV (${summary.igvPercent}%)` : "Plataforma exonerada de IGV"}
        </p>
      </div>
      {(!liveSummary || !liveExpenses || !livePnl) && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      <section>
        <h2 className="mb-3 font-serif text-lg font-semibold text-ink-900">Estado de resultados (últimos 6 meses)</h2>
        <ProfitAndLossCharts data={pnl} locale={locale} />
      </section>

      {summary.rows.map((row: any) => (
        <section key={row.currency} className="flex flex-col gap-4">
          <h2 className="font-serif text-lg font-semibold text-ink-900">
            Balance en {row.currency} {row.currency !== "PEN" && <span className="text-sm font-normal text-ash-500">(ventas internacionales)</span>}
          </h2>
          {row.currency !== "PEN" && (
            <Callout variant="info">
              Las ventas en {row.currency} se tratan como exportación de servicios — sin IGV peruano por defecto. Confirma este criterio con tu
              contador según el caso.
            </Callout>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
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
            {row.currency === "PEN" && summary.detractionEnabled && (
              <Card>
                <CardContent className="p-5">
                  <Receipt className="h-5 w-5 text-warning" aria-hidden="true" />
                  <p className="mt-3 font-serif text-xl font-semibold text-ink-900">{formatPrice(row.detraction, row.currency, locale)}</p>
                  <p className="text-sm text-ash-500">Detracción SUNAT</p>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardContent className="p-5">
                <CreditCard className="h-5 w-5 text-ink-700" aria-hidden="true" />
                <p className="mt-3 font-serif text-xl font-semibold text-ink-900">{formatPrice(row.providerFees, row.currency, locale)}</p>
                <p className="text-sm text-ash-500">Comisión {row.currency === "PEN" ? "Culqi" : "Stripe"}</p>
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
        <h2 className="mb-3 font-serif text-lg font-semibold text-ink-900">Comisiones de pasarela y detracción</h2>
        <FeeSettingsForm
          culqiFeePercent={summary.culqiFeePercent}
          stripeFeePercent={summary.stripeFeePercent}
          detractionEnabled={summary.detractionEnabled}
          detractionPercent={summary.detractionPercent}
        />
      </section>

      <section>
        <h2 className="mb-3 font-serif text-lg font-semibold text-ink-900">Otros gastos</h2>
        <ExpenseManager expenses={expenses} locale={locale} />
      </section>
    </div>
  );
}

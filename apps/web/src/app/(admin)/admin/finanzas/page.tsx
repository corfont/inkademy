import type { Metadata } from "next";
import Link from "next/link";
import { TrendingUp, Receipt, CreditCard, Wallet, Scale, SlidersHorizontal } from "lucide-react";
import { getLocale } from "next-intl/server";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { Card, CardContent } from "@/components/ui/Card";
import { Callout } from "@/components/ui/Callout";
import { Button } from "@/components/ui/Button";
import { ExpenseManager } from "@/components/admin/ExpenseManager";
import { OtherExpensesDetail } from "@/components/admin/OtherExpensesDetail";
import { FeeSettingsForm } from "@/components/admin/FeeSettingsForm";
import { FinanceExportControls } from "@/components/admin/FinanceExportControls";
import { ProfitAndLossCharts } from "@/components/admin/ProfitAndLossCharts";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Finanzas (admin)" };

const MOCK_SUMMARY = {
  from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  to: new Date().toISOString(),
  taxAffectation: "GRAVADO" as const,
  igvPercent: 18,
  culqiFeePercent: 3.99,
  stripeFeePercent: 4.99,
  yapePlinFeePercent: 0,
  detractionEnabled: true,
  detractionRucNaturalPercent: 12,
  detractionRucNaturalThreshold: 700,
  detractionRucEmpresaPercent: 12,
  usdExchangeRate: 3.75,
  exchangeRateSourceUrl: "https://www.sbs.gob.pe/app/pp/sistip_portal/paginas/publicacion/tipocambiopromedio.aspx",
  availableYears: [new Date().getFullYear()],
  rows: [{ currency: "PEN", income: 0, igv: 0, detraction: 0, detractionPenEquivalent: 0, providerFees: 0, otherExpenses: 0, balance: 0 }],
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

const PERIOD_LABEL: Record<string, string> = {
  last30d: "Últimos 30 días",
  lastYear: "Último año",
  allTime: "Todo el periodo",
  year: "Balance anual",
};

export default async function AdminFinancePage({ searchParams }: { searchParams: { period?: string; year?: string } }) {
  const locale = await getLocale();
  const accessToken = getServerAccessToken();
  const period = searchParams.period ?? "last30d";
  const year = searchParams.year ? Number(searchParams.year) : undefined;

  const [{ data: summary, live: liveSummary }, { data: expenses, live: liveExpenses }, { data: pnl, live: livePnl }] = await Promise.all([
    withFallback(() => adminApi.financialSummary({ period: period as any, year }, accessToken), MOCK_SUMMARY),
    withFallback(() => adminApi.expenses({}, accessToken), [] as any[]),
    withFallback(() => adminApi.profitAndLoss(6, accessToken), MOCK_PNL),
  ]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink-900">Finanzas</h1>
          <p className="mt-1 text-sm text-ash-500">
            {PERIOD_LABEL[period] ?? "Últimos 30 días"} · {summary.taxAffectation === "GRAVADO" ? `Plataforma afecta a IGV (${summary.igvPercent}%)` : "Plataforma exonerada de IGV"}
          </p>
        </div>
        {/* "Un botón de detalle para ver esas cifras... por categoría, diario/semanal/mensual/anual" */}
        <Link href="/admin/finanzas/detalle">
          <Button variant="outline" size="sm" className="gap-1.5">
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Ver detalle
          </Button>
        </Link>
      </div>
      {(!liveSummary || !liveExpenses || !livePnl) && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      <FinanceExportControls availableYears={summary.availableYears ?? []} />

      <section>
        <h2 className="mb-3 font-serif text-lg font-semibold text-ink-900">Estado de resultados ejecutivo (últimos 6 meses)</h2>
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
            <Card className="transition-shadow hover:shadow-raised">
              <CardContent className="p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-success-bg text-success">
                  <TrendingUp className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="mt-3 font-serif text-xl font-semibold text-ink-900">{formatPrice(row.income, row.currency, locale)}</p>
                <p className="text-sm text-ash-500">Ingresos</p>
              </CardContent>
            </Card>
            <Card className="transition-shadow hover:shadow-raised">
              <CardContent className="p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gold-100 text-gold-700">
                  <Receipt className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="mt-3 font-serif text-xl font-semibold text-ink-900">{formatPrice(row.igv, row.currency, locale)}</p>
                <p className="text-sm text-ash-500">IGV a pagar a SUNAT</p>
              </CardContent>
            </Card>
            {summary.detractionEnabled && (
              <Card className="transition-shadow hover:shadow-raised">
                <CardContent className="p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gold-100 text-gold-700">
                    <Receipt className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <p className="mt-3 font-serif text-xl font-semibold text-ink-900">{formatPrice(row.detraction, row.currency, locale)}</p>
                  <p className="text-sm text-ash-500">Detracción SUNAT</p>
                  {row.currency !== "PEN" && row.detractionPenEquivalent > 0 && (
                    <p className="mt-1 text-xs text-ash-500">
                      ≈ {formatPrice(row.detractionPenEquivalent, "PEN", locale)} a depositar (T.C. {summary.usdExchangeRate})
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
            <Card className="transition-shadow hover:shadow-raised">
              <CardContent className="p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                  <CreditCard className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="mt-3 font-serif text-xl font-semibold text-ink-900">{formatPrice(row.providerFees, row.currency, locale)}</p>
                <p className="text-sm text-ash-500">Comisión {row.currency === "PEN" ? "Culqi" : "Stripe"}</p>
              </CardContent>
            </Card>
            <Card className="transition-shadow hover:shadow-raised">
              <CardContent className="p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ash-100 text-ash-600">
                  <Wallet className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="mt-3 font-serif text-xl font-semibold text-ink-900">{formatPrice(row.otherExpenses, row.currency, locale)}</p>
                <p className="text-sm text-ash-500">Otros gastos</p>
              </CardContent>
            </Card>
            <Card className={`transition-shadow hover:shadow-raised ${row.balance >= 0 ? "border-success" : "border-danger"}`}>
              <CardContent className="p-5">
                <span className={`flex h-10 w-10 items-center justify-center rounded-full ${row.balance >= 0 ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>
                  <Scale className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className={`mt-3 font-serif text-xl font-semibold ${row.balance >= 0 ? "text-success" : "text-danger"}`}>
                  {formatPrice(row.balance, row.currency, locale)}
                </p>
                <p className="text-sm text-ash-500">Saldo total</p>
              </CardContent>
            </Card>
          </div>
          <OtherExpensesDetail summary={summary} currency={row.currency} locale={locale} />
        </section>
      ))}

      {/* "Yape y Plin tienen comisiones diferentes... eso debe de estar en
          la pestaña de finanzas" — antes esto solo vivía en /admin/configuracion
          con un aviso acá apuntando allá; ahora el mismo formulario (un solo
          componente, sin duplicar lógica) también se puede editar directo
          desde Finanzas, que es donde el admin realmente lo está buscando. */}
      <section>
        <h2 className="mb-3 font-serif text-lg font-semibold text-ink-900">Comisiones de pasarela y detracción SUNAT</h2>
        <Card>
          <CardContent className="p-6">
            <FeeSettingsForm
              culqiFeePercent={summary.culqiFeePercent}
              stripeFeePercent={summary.stripeFeePercent}
              yapePlinFeePercent={summary.yapePlinFeePercent}
              detractionEnabled={summary.detractionEnabled}
              detractionRucNaturalPercent={summary.detractionRucNaturalPercent}
              detractionRucNaturalThreshold={summary.detractionRucNaturalThreshold}
              detractionRucEmpresaPercent={summary.detractionRucEmpresaPercent}
              usdExchangeRate={summary.usdExchangeRate}
              exchangeRateSourceUrl={summary.exchangeRateSourceUrl ?? null}
            />
          </CardContent>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 font-serif text-lg font-semibold text-ink-900">Otros gastos</h2>
        <ExpenseManager expenses={expenses} locale={locale} />
      </section>
    </div>
  );
}

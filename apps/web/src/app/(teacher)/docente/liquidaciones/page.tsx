import type { Metadata } from "next";
import { adminApi } from "@/lib/api-client";
import { withFallback } from "@/lib/safe-fetch";
import { getServerAccessToken } from "@/lib/server-auth";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card, CardContent } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Mis liquidaciones (docente)" };

function currencySymbol(currency: string) {
  return currency === "USD" ? "US$ " : "S/ ";
}

export default async function MyLiquidationsPage() {
  const accessToken = getServerAccessToken();
  const { data: liquidations, live } = await withFallback(() => adminApi.myTeacherLiquidations(accessToken), [] as any[]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Mis liquidaciones</h1>
        <p className="mt-1 text-sm text-ash-500">Horas dictadas, otras actividades, adelantos y el neto a cobrar por cada periodo — solo lectura.</p>
      </div>
      {!live && <Callout variant="info">Mostrando datos de referencia; no pudimos conectar con la API.</Callout>}

      {liquidations.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-ash-500">Todavía no tienes liquidaciones registradas.</CardContent>
        </Card>
      ) : (
        liquidations.map((l: any) => (
          <Card key={l.id}>
            <CardContent className="flex flex-col gap-2 p-6">
              <div className="flex items-center justify-between">
                <p className="font-medium text-ink-900">
                  {new Date(l.periodStart).toLocaleDateString("es-PE")} — {new Date(l.periodEnd).toLocaleDateString("es-PE")}
                </p>
                <Badge variant={l.status === "PAID" ? "success" : l.status === "APPROVED" ? "warning" : "outline"}>{l.status}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm text-ash-700 sm:grid-cols-4">
                <p>Horas dictado: {l.hoursTeaching}h</p>
                <p>Otras actividades: {l.hoursOtherActivities}h</p>
                <p>
                  Bruto: {currencySymbol(l.currency)}
                  {Number(l.grossAmount).toFixed(2)}
                </p>
                <p className="font-semibold text-ink-900">
                  Neto: {currencySymbol(l.currency)}
                  {Number(l.netAmount).toFixed(2)}
                </p>
              </div>
              {Number(l.deductions) > 0 && (
                <p className="text-xs text-ash-500">
                  Descuento por tardanza/salida temprana: {currencySymbol(l.currency)}
                  {Number(l.deductions).toFixed(2)} {l.deductionsWaived && "(perdonado)"}
                </p>
              )}
              {Number(l.advancesDeducted) > 0 && (
                <p className="text-xs text-ash-500">
                  Adelantos descontados: {currencySymbol(l.currency)}
                  {Number(l.advancesDeducted).toFixed(2)}
                </p>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

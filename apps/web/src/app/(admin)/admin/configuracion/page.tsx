import type { Metadata } from "next";
import { adminApi } from "@/lib/api-client";
import { getServerAccessToken } from "@/lib/server-auth";
import { Card, CardContent } from "@/components/ui/Card";
import { Callout } from "@/components/ui/Callout";
import { FeeSettingsForm } from "@/components/admin/FeeSettingsForm";
import { TaxSettingsForm } from "@/components/admin/TaxSettingsForm";
import { SuggestionAutoRespondForm } from "@/components/admin/SuggestionAutoRespondForm";

export const metadata: Metadata = { title: "Configuración avanzada (admin)" };

/**
 * "Todo lo que se parametriza debería estar separado en un módulo aparte,
 * para que por equivocación no se vaya a mover algo" — comisiones de
 * pasarela, detracción, IGV y el comportamiento del asistente de IA vivían
 * repartidos en /admin/finanzas, /admin/facturacion y /admin/asistente-ia,
 * mezclados con pantallas de uso más casual. Ahora viven todos acá, en un
 * único lugar de acceso deliberado.
 */
export default async function AdvancedSettingsPage() {
  const accessToken = getServerAccessToken();
  const [summary, sunat, chatbot] = await Promise.all([
    adminApi.financialSummary({}, accessToken),
    adminApi.sunatSettings(accessToken),
    adminApi.chatbotSettings(accessToken),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Configuración avanzada</h1>
        <p className="mt-1 text-sm text-ash-500">Comisiones, impuestos, detracción y comportamiento del asistente de IA — todo en un solo lugar.</p>
      </div>
      <Callout variant="warning">Estos valores afectan directamente lo que se cobra y se reporta como pagado a SUNAT. Cámbialos con cuidado.</Callout>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Impuestos (IGV)</h2>
          <TaxSettingsForm taxAffectation={sunat.taxAffectation} igvPercent={sunat.igvPercent} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Comisiones de pasarela y detracción SUNAT</h2>
          <FeeSettingsForm
            culqiFeePercent={summary.culqiFeePercent}
            stripeFeePercent={summary.stripeFeePercent}
            yapePlinFeePercent={summary.yapePlinFeePercent}
            detractionEnabled={summary.detractionEnabled}
            detractionRucNaturalPercent={summary.detractionRucNaturalPercent}
            detractionRucNaturalThreshold={summary.detractionRucNaturalThreshold}
            detractionRucEmpresaPercent={summary.detractionRucEmpresaPercent}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 p-6">
          <h2 className="font-serif text-lg font-semibold text-ink-900">Respuesta automática del asistente de IA</h2>
          <SuggestionAutoRespondForm
            suggestionAutoRespond={chatbot.suggestionAutoRespond}
            suggestionAutoRespondDelayMinutes={chatbot.suggestionAutoRespondDelayMinutes}
          />
        </CardContent>
      </Card>
    </div>
  );
}

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ChargeParams, ChargeResult, PaymentProvider } from "./payment-provider.interface";

/**
 * Adapter de Culqi (Perú: tarjetas, Yape, PagoEfectivo) — llama directo al
 * REST de Culqi (`POST https://api.culqi.com/v2/charges`) con la secret key.
 * El `token` recibido en el body de checkout es el `source_id` (token/cargo
 * generado por el SDK público de Culqi en el navegador del comprador) —
 * nunca se recibe ni persiste el número de tarjeta.
 */
@Injectable()
export class CulqiProvider implements PaymentProvider {
  readonly type = "CULQI" as const;
  private readonly logger = new Logger(CulqiProvider.name);
  private readonly secretKey: string;

  constructor(private readonly config: ConfigService) {
    this.secretKey = this.config.get<string>("CULQI_SECRET_KEY", "");
  }

  async charge(params: ChargeParams): Promise<ChargeResult> {
    if (!this.secretKey) {
      this.logger.warn("CULQI_SECRET_KEY no configurada — simulando cobro exitoso (modo dev)");
      return { success: true, providerRef: `sim_culqi_${Date.now()}` };
    }

    const res = await fetch("https://api.culqi.com/v2/charges", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: params.amountInMinorUnits,
        currency_code: params.currency,
        email: params.email,
        source_id: params.token,
        description: params.description,
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      this.logger.warn(`Culqi rechazó el cargo: ${JSON.stringify(body)}`);
      return { success: false, failureMessage: body?.user_message ?? body?.merchant_message ?? "Pago rechazado" };
    }
    return { success: true, providerRef: body.id, receiptUrl: body?.receipt_url };
  }
}

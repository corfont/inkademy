import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ChargeParams, ChargeResult, PaymentProvider, RefundParams, RefundResult } from "./payment-provider.interface";

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

  /**
   * "Culqi no publica un esquema de verificación de firma tan estandarizado
   * como Stripe" — pero eso no significa que haya que confiar a ciegas en
   * el body que llega a /webhooks/culqi. En vez de firma, se hace lo que
   * Culqi sí soporta bien: re-consultar el cargo directamente contra su API
   * con la secret key ANTES de marcar una orden como pagada. Sin esto,
   * cualquiera que conociera (u observara) el `providerRef` de un cargo
   * podía simular la notificación de éxito y matricularse gratis —
   * hallazgo de auditoría de seguridad.
   */
  async verifyChargeSucceeded(chargeId: string): Promise<boolean> {
    if (!this.secretKey || chargeId.startsWith("sim_")) {
      // Modo dev sin secret key configurada: no hay nada real que verificar.
      return true;
    }
    try {
      const res = await fetch(`https://api.culqi.com/v2/charges/${encodeURIComponent(chargeId)}`, {
        headers: { Authorization: `Bearer ${this.secretKey}` },
      });
      if (!res.ok) {
        this.logger.warn(`No se pudo verificar el cargo ${chargeId} contra la API de Culqi: HTTP ${res.status}`);
        return false;
      }
      const body = await res.json().catch(() => ({}));
      // outcome.type "venta_exitosa" es el único estado que Culqi considera
      // realmente cobrado — cualquier otra cosa (pendiente, rechazado) no cuenta.
      return body?.outcome?.type === "venta_exitosa";
    } catch (err) {
      this.logger.warn(`Error de red verificando el cargo ${chargeId} contra Culqi: ${String(err)}`);
      return false;
    }
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    if (!this.secretKey || params.providerRef.startsWith("sim_")) {
      this.logger.warn("CULQI_SECRET_KEY no configurada (o cargo simulado) — simulando reembolso (modo dev)");
      return { success: true, providerRefundRef: `sim_refund_${Date.now()}` };
    }

    const res = await fetch("https://api.culqi.com/v2/refunds", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        charge_id: params.providerRef,
        amount: params.amountInMinorUnits,
        reason: "solicitud_comprador",
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      this.logger.warn(`Culqi rechazó el reembolso: ${JSON.stringify(body)}`);
      return { success: false, failureMessage: body?.user_message ?? body?.merchant_message ?? "Reembolso rechazado" };
    }
    return { success: true, providerRefundRef: body.id };
  }
}

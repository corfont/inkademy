import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ChargeParams, ChargeResult, PaymentProvider, RefundParams, RefundResult } from "./payment-provider.interface";

/**
 * Adapter de PayPal (compradores internacionales, tercer método junto a
 * Culqi/Stripe — "PayPal queda como tercer adapter mecánico en Fase 2,
 * misma interfaz" del plan original). A diferencia de Culqi/Stripe, donde
 * el frontend genera un token y esta clase cobra en un solo paso, PayPal
 * exige que el comprador APRUEBE una orden ya creada antes de poder
 * capturarla — por eso `params.token` acá NO es un token de tarjeta, es el
 * ID de una orden de PayPal ya aprobada (creada antes con `createOrder()`,
 * ver CommerceService.createPayPalOrder). `charge()` solo la captura.
 */
@Injectable()
export class PayPalProvider implements PaymentProvider {
  readonly type = "PAYPAL" as const;
  private readonly logger = new Logger(PayPalProvider.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly baseUrl: string;
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {
    this.clientId = this.config.get<string>("PAYPAL_CLIENT_ID", "");
    this.clientSecret = this.config.get<string>("PAYPAL_CLIENT_SECRET", "");
    // "sandbox" para pruebas, "live" para dinero real — nunca se asume
    // producción por defecto, hay que optar explícitamente.
    this.baseUrl =
      this.config.get<string>("PAYPAL_ENV", "sandbox") === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  }

  private get configured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) return this.cachedToken.value;
    const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) throw new Error(`No se pudo obtener el token de PayPal (HTTP ${res.status})`);
    const body = await res.json();
    // Se guarda con 60s de margen antes de que expire de verdad, para no
    // arriesgarse a usar un token vencido a mitad de una request.
    this.cachedToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in - 60) * 1000 };
    return this.cachedToken.value;
  }

  /** Crea la orden (sin capturar) — el frontend la usa para renderizar el botón de aprobación de PayPal. */
  async createOrder(params: { amountInMinorUnits: number; currency: "USD" }): Promise<string> {
    if (!this.configured) {
      this.logger.warn("PAYPAL_CLIENT_ID/SECRET no configuradas — simulando orden de PayPal (modo dev)");
      return `sim_paypal_order_${Date.now()}`;
    }
    const accessToken = await this.getAccessToken();
    const amount = (params.amountInMinorUnits / 100).toFixed(2);
    const res = await fetch(`${this.baseUrl}/v2/checkout/orders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{ amount: { currency_code: params.currency, value: amount } }],
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      this.logger.warn(`PayPal rechazó la creación de la orden: ${JSON.stringify(body)}`);
      throw new Error(body?.message ?? "No se pudo crear la orden de PayPal");
    }
    return body.id;
  }

  async charge(params: ChargeParams): Promise<ChargeResult> {
    if (!this.configured || params.token.startsWith("sim_")) {
      this.logger.warn("PAYPAL_CLIENT_ID/SECRET no configuradas (u orden simulada) — simulando cobro exitoso (modo dev)");
      return { success: true, providerRef: `sim_paypal_capture_${Date.now()}` };
    }
    try {
      const accessToken = await this.getAccessToken();
      // `params.token` es el orderId ya aprobado por el comprador en el
      // botón de PayPal del frontend — acá solo se captura, nunca se crea
      // ni se confía en un monto nuevo.
      const res = await fetch(`${this.baseUrl}/v2/checkout/orders/${encodeURIComponent(params.token)}/capture`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.status !== "COMPLETED") {
        this.logger.warn(`PayPal rechazó la captura: ${JSON.stringify(body)}`);
        return { success: false, failureMessage: body?.message ?? "El pago no se pudo capturar" };
      }
      const captureId = body.purchase_units?.[0]?.payments?.captures?.[0]?.id ?? body.id;
      return { success: true, providerRef: captureId };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error de PayPal";
      this.logger.warn(`Error al capturar la orden de PayPal: ${message}`);
      return { success: false, failureMessage: message };
    }
  }

  async refund(params: RefundParams): Promise<RefundResult> {
    if (!this.configured || params.providerRef.startsWith("sim_")) {
      this.logger.warn("PAYPAL_CLIENT_ID/SECRET no configuradas (o cargo simulado) — simulando reembolso (modo dev)");
      return { success: true, providerRefundRef: `sim_refund_${Date.now()}` };
    }
    try {
      const accessToken = await this.getAccessToken();
      const res = await fetch(`${this.baseUrl}/v2/payments/captures/${encodeURIComponent(params.providerRef)}/refund`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ amount: { currency_code: "USD", value: (params.amountInMinorUnits / 100).toFixed(2) } }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        this.logger.warn(`PayPal rechazó el reembolso: ${JSON.stringify(body)}`);
        return { success: false, failureMessage: body?.message ?? "Reembolso rechazado" };
      }
      return { success: true, providerRefundRef: body.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error de PayPal al reembolsar";
      this.logger.warn(message);
      return { success: false, failureMessage: message };
    }
  }
}

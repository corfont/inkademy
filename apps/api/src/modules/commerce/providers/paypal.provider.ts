import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ChargeParams, ChargeResult, PaymentProvider, RefundParams, RefundResult } from "./payment-provider.interface";
import { paymentSimulationAllowed, PAYMENTS_NOT_CONFIGURED } from "./simulation";

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
      if (!paymentSimulationAllowed(this.config)) throw new ServiceUnavailableException(PAYMENTS_NOT_CONFIGURED);
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
      // Con PayPal configurado, un token "sim_…" lo puede mandar cualquiera: solo vale donde la simulación está permitida.
      if (!paymentSimulationAllowed(this.config)) {
        this.logger.error("Cobro PayPal rechazado: orden simulada o PayPal sin configurar en producción");
        return { success: false, failureMessage: PAYMENTS_NOT_CONFIGURED };
      }
      this.logger.warn("PAYPAL_CLIENT_ID/SECRET no configuradas (u orden simulada) — simulando cobro exitoso (modo dev)");
      return { success: true, providerRef: `sim_paypal_capture_${Date.now()}` };
    }
    try {
      const accessToken = await this.getAccessToken();
      // `params.token` es el orderId ya aprobado por el comprador en el
      // botón de PayPal del frontend — acá solo se captura, nunca se crea
      // ni se confía en un monto nuevo.
      // Antes de capturar se comprueba que la orden aprobada por el comprador es POR EL MONTO de este carrito: sin esto se podía aprobar una orden barata y usarla para pagar un curso caro.
      const detailRes = await fetch(`${this.baseUrl}/v2/checkout/orders/${encodeURIComponent(params.token)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const detail = await detailRes.json().catch(() => ({}));
      const approved = detail?.purchase_units?.[0]?.amount;
      const expected = (params.amountInMinorUnits / 100).toFixed(2);
      if (!detailRes.ok || !approved || Number(approved.value).toFixed(2) !== expected || String(approved.currency_code).toUpperCase() !== params.currency) {
        this.logger.error(`PayPal: la orden ${params.token} no coincide con el monto del carrito (esperado ${expected} ${params.currency}) — captura rechazada`);
        return { success: false, failureMessage: "El monto aprobado en PayPal no coincide con tu compra. No se hizo ningún cobro." };
      }
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
      if (!paymentSimulationAllowed(this.config)) return { success: false, failureMessage: "No se puede reembolsar: el cargo no es real o PayPal no está configurado." };
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

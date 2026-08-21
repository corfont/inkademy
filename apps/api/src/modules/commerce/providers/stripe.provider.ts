import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Stripe from "stripe";
import type { ChargeParams, ChargeResult, PaymentProvider } from "./payment-provider.interface";

/** Adapter de Stripe (compradores internacionales) usando el SDK oficial `stripe`. */
@Injectable()
export class StripeProvider implements PaymentProvider {
  readonly type = "STRIPE" as const;
  private readonly logger = new Logger(StripeProvider.name);
  private readonly stripe: Stripe | null;

  constructor(private readonly config: ConfigService) {
    const secretKey = this.config.get<string>("STRIPE_SECRET_KEY", "");
    this.stripe = secretKey ? new Stripe(secretKey, { apiVersion: "2024-06-20" }) : null;
  }

  async charge(params: ChargeParams): Promise<ChargeResult> {
    if (!this.stripe) {
      this.logger.warn("STRIPE_SECRET_KEY no configurada — simulando cobro exitoso (modo dev)");
      return { success: true, providerRef: `sim_stripe_${Date.now()}` };
    }

    try {
      const intent = await this.stripe.paymentIntents.create({
        amount: params.amountInMinorUnits,
        currency: params.currency.toLowerCase(),
        payment_method: params.token,
        receipt_email: params.email,
        description: params.description,
        confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      });

      if (intent.status !== "succeeded") {
        return { success: false, failureMessage: `Estado del pago: ${intent.status}` };
      }
      const chargeId =
        typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge?.id;
      let receiptUrl: string | undefined;
      if (chargeId) {
        const charge = await this.stripe.charges.retrieve(chargeId);
        receiptUrl = charge.receipt_url ?? undefined;
      }
      return { success: true, providerRef: intent.id, receiptUrl };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error de Stripe";
      this.logger.warn(`Stripe rechazó el cargo: ${message}`);
      return { success: false, failureMessage: message };
    }
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string): Stripe.Event | null {
    if (!this.stripe) return null;
    const secret = this.config.get<string>("STRIPE_WEBHOOK_SECRET", "");
    try {
      return this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (err) {
      this.logger.warn(`Firma de webhook de Stripe inválida: ${(err as Error).message}`);
      return null;
    }
  }
}

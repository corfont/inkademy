import type { PaymentProviderType } from "@inkademy/shared";

export interface ChargeParams {
  /** Monto en la unidad mínima de la moneda (centavos/cents). */
  amountInMinorUnits: number;
  currency: "PEN" | "USD";
  /** Token generado por el SDK del proveedor en el cliente (nunca el número de tarjeta). */
  token: string;
  description: string;
  email: string;
}

export interface ChargeResult {
  success: boolean;
  providerRef?: string;
  receiptUrl?: string;
  failureMessage?: string;
}

/** Contrato común para adapters de cobro (Culqi, Stripe, ...). */
export interface PaymentProvider {
  readonly type: PaymentProviderType;
  charge(params: ChargeParams): Promise<ChargeResult>;
}

export const PAYMENT_PROVIDERS_TOKEN = "PAYMENT_PROVIDERS";

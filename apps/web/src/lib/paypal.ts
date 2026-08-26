// Integración real con el SDK de botones de PayPal — "PayPal queda como
// tercer adapter mecánico en Fase 2, misma interfaz" del plan original.
// A diferencia de Culqi (que abre un modal propio), el SDK de PayPal
// necesita un contenedor del DOM donde renderiza SU botón — por eso acá
// solo se expone la carga del script; el render vive en
// components/checkout/PayPalButton.tsx.
//
// Requiere NEXT_PUBLIC_PAYPAL_CLIENT_ID (PayPal Developer Dashboard →
// Apps & Credentials → Sandbox, para probar sin mover dinero real). Sin
// esa variable, `isPayPalConfigured()` devuelve false y el checkout usa su
// alternativa simulada, igual que ya pasa con Culqi/Stripe.

declare global {
  interface Window {
    paypal?: {
      Buttons: (opts: {
        style?: Record<string, unknown>;
        createOrder: () => Promise<string>;
        onApprove: (data: { orderID: string }) => Promise<void> | void;
        onError?: (err: unknown) => void;
        onCancel?: () => void;
      }) => { render: (container: HTMLElement) => void };
    };
  }
}

const PAYPAL_SCRIPT_BASE = "https://www.paypal.com/sdk/js";

let scriptPromise: Promise<void> | null = null;

export function isPayPalConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID);
}

export function loadPayPalScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("PayPal solo puede cargarse en el navegador"));
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  if (!clientId) return Promise.reject(new Error("Falta configurar NEXT_PUBLIC_PAYPAL_CLIENT_ID para aceptar pagos reales con PayPal."));
  if (window.paypal) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${PAYPAL_SCRIPT_BASE}?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("No se pudo cargar el widget de PayPal. Verifica tu conexión e intenta de nuevo."));
    };
    document.body.appendChild(script);
  });
  return scriptPromise;
}

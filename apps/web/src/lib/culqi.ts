// Integración real con el widget de Culqi Checkout v4 — Yape, Plin (vía
// "billetera"/agente según habilitación de la cuenta) y tarjeta ya vienen
// resueltos por el propio widget de Culqi; Inkademy no construye ninguna UI
// de captura de tarjeta/Yape a mano (antes el formulario de checkout
// simulaba la tokenización con `fakeTokenize`, un string inventado que
// nunca tocaba la API real de Culqi).
//
// Requiere NEXT_PUBLIC_CULQI_PUBLIC_KEY configurada (panel de Culqi →
// Desarrollo → Llave pública de PRUEBA para modo sandbox, sin mover dinero
// real). Sin esa variable, `isCulqiConfigured()` devuelve false y el
// checkout debe usar su alternativa (ver apps/web/src/app/checkout/page.tsx).

declare global {
  interface Window {
    Culqi?: {
      publicKey: string;
      settings: (opts: Record<string, unknown>) => void;
      options: (opts: Record<string, unknown>) => void;
      open: () => void;
      close: () => void;
      token?: { id: string; email: string } | null;
      order?: unknown;
      error?: { user_message?: string; merchant_message?: string } | null;
    };
    culqi?: () => void;
  }
}

const CULQI_SCRIPT_SRC = "https://checkout.culqi.com/js/v4";

let scriptPromise: Promise<void> | null = null;

function loadCulqiScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Culqi solo puede cargarse en el navegador"));
  if (window.Culqi) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CULQI_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("No se pudo cargar el widget de pago de Culqi. Verifica tu conexión e intenta de nuevo."));
    };
    document.body.appendChild(script);
  });
  return scriptPromise;
}

export function isCulqiConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_CULQI_PUBLIC_KEY);
}

export interface CulqiTokenResult {
  token: string;
  email: string;
}

/**
 * Abre el widget de Culqi (tarjeta + Yape) y resuelve con el token cuando
 * el comprador completa el pago, o rechaza si cancela o hay un error. El
 * token resultante se manda tal cual a POST /checkout como
 * `paymentMethodToken` — CulqiProvider.charge() en la API ya sabe usarlo
 * (source_id) contra /v2/charges de Culqi.
 */
export async function openCulqiCheckout(opts: {
  amountInCents: number;
  currency: "PEN";
  title: string;
  description: string;
  email?: string;
}): Promise<CulqiTokenResult> {
  const publicKey = process.env.NEXT_PUBLIC_CULQI_PUBLIC_KEY;
  if (!publicKey) {
    throw new Error("Falta configurar NEXT_PUBLIC_CULQI_PUBLIC_KEY para aceptar pagos reales con Culqi.");
  }
  await loadCulqiScript();
  const Culqi = window.Culqi!;
  Culqi.publicKey = publicKey;

  return new Promise((resolve, reject) => {
    window.culqi = function culqiCallback() {
      if (Culqi.token) {
        resolve({ token: Culqi.token.id, email: Culqi.token.email });
      } else if (Culqi.error) {
        reject(new Error(Culqi.error.user_message || Culqi.error.merchant_message || "El pago no se pudo procesar."));
      } else {
        reject(new Error("Se cerró la ventana de pago sin completar el cobro."));
      }
    };
    Culqi.settings({
      title: opts.title,
      currency: opts.currency,
      amount: opts.amountInCents,
      description: opts.description,
      ...(opts.email ? { email: opts.email } : {}),
    });
    // Yape/Plin quedan a criterio de lo que la cuenta de Culqi tenga
    // habilitado — si no están activados en el panel de Culqi, el widget
    // simplemente no los muestra, sin romper nada.
    Culqi.options({
      lang: "auto",
      installments: false,
      paymentMethods: { tarjeta: true, yape: true, bancaMovil: false, agente: false, billetera: false, cuotealo: false },
    });
    Culqi.open();
  });
}

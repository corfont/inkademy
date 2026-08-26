"use client";

import { useEffect, useRef, useState } from "react";
import { isPayPalConfigured, loadPayPalScript } from "@/lib/paypal";
import { commerceApi } from "@/lib/api-client";
import { Callout } from "@/components/ui/Callout";

interface CheckoutItem {
  offeringKind: "COURSE" | "PROGRAM";
  courseId?: string;
  programId?: string;
  seatPoolQty?: number;
}

/**
 * Renderiza el botón real de PayPal en vez de un formulario propio — a
 * diferencia de Culqi/Stripe, PayPal exige que el comprador APRUEBE la
 * orden en SU propio botón antes de poder cobrarla, así que este
 * componente no pasa por el submit normal del formulario de checkout: al
 * aprobar, llama directo a `onApproved` con el orderId ya aprobado.
 */
export function PayPalButton({
  items,
  companyId,
  disabled,
  onApproved,
  onError,
}: {
  items: CheckoutItem[];
  companyId?: string;
  disabled?: boolean;
  onApproved: (orderId: string) => void;
  onError: (message: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isPayPalConfigured()) {
      setLoadError("PayPal no está configurado en este entorno (falta NEXT_PUBLIC_PAYPAL_CLIENT_ID) — usa la alternativa de prueba abajo.");
      return;
    }
    loadPayPalScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.paypal) return;
        containerRef.current.innerHTML = "";
        window.paypal
          .Buttons({
            style: { layout: "vertical", label: "pay" },
            createOrder: async () => {
              const result = await commerceApi.createPayPalOrder({ items, companyId });
              return result.orderId;
            },
            onApprove: async (data) => {
              onApproved(data.orderID);
            },
            onError: (err) => {
              onError(err instanceof Error ? err.message : "El pago con PayPal no se pudo procesar.");
            },
            onCancel: () => {
              onError("Cancelaste la ventana de PayPal antes de completar el pago.");
            },
          })
          .render(containerRef.current);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "No se pudo cargar PayPal."));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loadError) {
    return (
      <Callout variant="info" className="mt-3">
        {loadError}
      </Callout>
    );
  }

  return <div ref={containerRef} className={disabled ? "pointer-events-none opacity-50" : ""} />;
}

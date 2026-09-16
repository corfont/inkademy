import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Puente de cotizaciones/identidad con el CRM de Inkapitales — ver
 * ../../../../../../../CLAUDE.md ("Identidad cruzada de empresas/personas y
 * puente de cotizaciones") y CRM/app/src/lib/integraciones.ts (el lado que
 * recibe esta llamada). Mismo patrón que licita-perú's lib/integracion-crm.js:
 * find-or-create de un Partner (empresa/persona) en el CRM y registro de la
 * venta como Quote, idempotente por (sourceSystem, sourceId).
 *
 * A diferencia del CRM_BRIDGE_SECRET ya existente (SSO: un admin del CRM
 * entra a Inkademy sin credenciales — dirección inversa), este secreto es
 * NUEVO y de solo lectura/escritura server-a-servidor hacia el CRM — nunca
 * se expone a un panel de Configuración.
 *
 * SUNAT catálogo 06 (buyerDocumentType/Company.taxIdType) no coincide 1:1
 * con el DocType del CRM (DNI/RUC/CE/PASSPORT) — solo se sincroniza cuando
 * el documento es peruano y de un tipo mapeable; cualquier otro caso
 * (extranjero, NIT, EIN, sin documento) se omite en silencio (ver
 * mapDocType) en vez de forzar un mapeo incorrecto.
 */
@Injectable()
export class CrmBridgeProvider {
  private readonly logger = new Logger(CrmBridgeProvider.name);
  private readonly baseUrl: string;
  private readonly secret: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>("CRM_API_URL", "");
    this.secret = this.config.get<string>("CRM_API_SECRET", "");
  }

  private mapDocType(country: string | null | undefined, tipo: string | null | undefined): "DNI" | "RUC" | "CE" | "PASSPORT" | null {
    if ((country ?? "").toUpperCase() !== "PE") return null;
    const t = (tipo ?? "").trim().toUpperCase();
    // SUNAT catálogo 06: 1=DNI, 6=RUC, 4=Carné extranjería, 7=Pasaporte, 0=sin documento.
    if (t === "1" || t === "DNI") return "DNI";
    if (t === "6" || t === "RUC") return "RUC";
    if (t === "4" || t === "CE") return "CE";
    if (t === "7" || t === "PASSPORT" || t === "PASAPORTE") return "PASSPORT";
    return null;
  }

  /**
   * Envía una venta (Order pagada) al CRM como Quote, con el Partner
   * correspondiente (la Company si fue B2B, o el comprador individual si
   * fue B2C). NUNCA lanza — un fallo aquí no debe afectar la confirmación
   * de la compra ni la matrícula, que ya ocurrieron. Devuelve
   * {sincronizado, motivo?} solo para logging/depuración.
   */
  async sincronizarVenta(params: {
    sourceId: string;
    currency: string;
    partner:
      | { kind: "company"; country: string; taxIdType: string; taxId: string; legalName: string }
      | { kind: "buyer"; country: string | null; documentType: string | null; documentNumber: string | null; legalName: string | null };
    lineas: { description: string; quantity: number; unitPrice: number }[];
  }): Promise<{ sincronizado: boolean; motivo?: string; quoteNumber?: string }> {
    if (!this.baseUrl || !this.secret) {
      this.logger.warn("CRM_API_URL/CRM_API_SECRET no configurados — venta no sincronizada con el CRM.");
      return { sincronizado: false, motivo: "sin_configurar" };
    }

    const docType =
      params.partner.kind === "company"
        ? this.mapDocType(params.partner.country, params.partner.taxIdType)
        : this.mapDocType(params.partner.country, params.partner.documentType);
    const docNumber = params.partner.kind === "company" ? params.partner.taxId : params.partner.documentNumber;
    const name = params.partner.kind === "company" ? params.partner.legalName : params.partner.legalName;

    if (!docType || !docNumber || !name?.trim()) {
      this.logger.warn(`Sin documento peruano mapeable para ${params.sourceId} — venta no sincronizada con el CRM.`);
      return { sincronizado: false, motivo: "sin_documento_mapeable" };
    }

    try {
      const res = await fetch(`${this.baseUrl}/api/integraciones/cotizaciones`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.secret}` },
        body: JSON.stringify({
          sourceSystem: "inkademy",
          sourceId: params.sourceId,
          partner: { docType, docNumber, name: name.trim() },
          currency: params.currency === "USD" ? "USD" : "PEN",
          lines: params.lineas,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        this.logger.warn(`El CRM rechazó la sincronización de ${params.sourceId}: ${res.status} ${await res.text().catch(() => "")}`);
        return { sincronizado: false, motivo: "crm_rechazo" };
      }
      const data = await res.json();
      return { sincronizado: true, quoteNumber: data.number };
    } catch (err) {
      const message = err instanceof Error ? err.message : "error desconocido";
      this.logger.warn(`No se pudo contactar al CRM para ${params.sourceId}: ${message}`);
      return { sincronizado: false, motivo: "error_red" };
    }
  }
}

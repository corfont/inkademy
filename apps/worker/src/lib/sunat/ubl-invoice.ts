// ============================================================================
// Construcción del XML UBL 2.1 para Boleta/Factura electrónica SUNAT (Perú).
//
// Estructura mínima validada contra el servicio BETA real de SUNAT
// (billService de e-beta.sunat.gob.pe) durante el desarrollo de esta
// integración: un envío de prueba con esta forma exacta (tras firmarla, ver
// sign.ts) devolvió HTTP 200 y CDR con ResponseCode 0 ("... ha sido
// aceptada"). Cualquier cambio de estructura debe volver a probarse contra
// BETA antes de tocar producción — SUNAT valida el XML contra su XSD con
// mensajes de error poco descriptivos (p.ej. "cvc-complex-type").
// ============================================================================

export type SunatDocumentType = "BOLETA" | "FACTURA";

export interface UblInvoiceInput {
  documentType: SunatDocumentType;
  series: string;
  correlativo: number;
  issueDate: Date; // se serializa como YYYY-MM-DD (hora de Perú)
  currency: "PEN" | "USD";
  supplier: {
    ruc: string;
    legalName: string;
    address: string;
    ubigeo: string; // catálogo 06 UBIGEO INEI, p.ej. "150101" (Lima)
  };
  buyer: {
    documentType: string; // catálogo 06 SUNAT: 1=DNI, 6=RUC, 4=CE, 7=Pasaporte, 0=sin doc.
    documentNumber: string;
    legalName: string;
  };
  /** true = exonerado de IGV (servicios de enseñanza — Apéndice II Ley IGV, salvo que se indique lo contrario vía SUNAT_TAX_AFFECTATION). */
  igvExempt: boolean;
  /** % de IGV vigente (18 en Perú desde 2011) — parametrizable, ver SunatSettings.igvPercent. Default 18 si no se pasa (compatibilidad). */
  igvPercent?: number;
  line: {
    description: string;
    quantity: number;
    unitPrice: number; // precio unitario CON impuestos incluidos (como se le cobra al alumno)
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Fecha en zona horaria de Perú (UTC-5, sin cambio de horario) sin tirar de librerías de fechas. */
function formatPeruDate(date: Date): string {
  const peruMs = date.getTime() - 5 * 60 * 60 * 1000;
  const d = new Date(peruMs);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function money(n: number): string {
  return n.toFixed(2);
}

/**
 * Construye el XML UBL 2.1 (sin firmar) de una Boleta (tipo 03) o Factura
 * (tipo 01). Deja un `ext:ExtensionContent` vacío listo para que `sign.ts`
 * inserte ahí el `ds:Signature` (SUNAT exige la firma dentro de
 * UBLExtensions, no como hijo directo de `Invoice`).
 */
export function buildUblInvoiceXml(input: UblInvoiceInput): string {
  const { documentType, series, correlativo, currency, supplier, buyer, line } = input;
  const invoiceTypeCode = documentType === "FACTURA" ? "01" : "03";
  const id = `${series}-${correlativo}`;
  const issueDate = formatPeruDate(input.issueDate);

  const igvRate = input.igvPercent ?? 18;
  const lineExtensionAmount = line.quantity * line.unitPrice;
  // Con IGV incluido en el precio mostrado al alumno: si está afecto,
  // separamos base imponible + IGV a partir del precio final; si está
  // exonerado, el precio final ES la base imponible y el IGV es 0.
  const taxAmount = input.igvExempt ? 0 : lineExtensionAmount - lineExtensionAmount / (1 + igvRate / 100);
  const taxableAmount = lineExtensionAmount - taxAmount;
  const taxCategoryId = input.igvExempt ? "E" : "S"; // catálogo 07: E=Exonerado, S=Gravado-IGV
  const taxExemptionReasonCode = input.igvExempt ? "20" : undefined; // catálogo 07 SUNAT
  const igvPercent = input.igvExempt ? "0.00" : igvRate.toFixed(2);
  // Catálogo 05 (tributos): 1000=IGV (solo para líneas gravadas — SUNAT
  // rechaza con error 3111 si se usa 1000 con monto 0), 9997=EXONERADO,
  // usado cuando la línea no está afecta a IGV (validado contra SUNAT beta).
  const taxSchemeId = input.igvExempt ? "9997" : "1000";
  const taxSchemeName = input.igvExempt ? "EXO" : "IGV";

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent></ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>${escapeXml(id)}</cbc:ID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:InvoiceTypeCode listID="0101">${invoiceTypeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>
  <cac:Signature>
    <cbc:ID>IDSignSP</cbc:ID>
    <cac:SignatoryParty>
      <cac:PartyIdentification>
        <cbc:ID>${escapeXml(supplier.ruc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name><![CDATA[${supplier.legalName}]]></cbc:Name>
      </cac:PartyName>
    </cac:SignatoryParty>
    <cac:DigitalSignatureAttachment>
      <cac:ExternalReference>
        <cbc:URI>#SunatSignature</cbc:URI>
      </cac:ExternalReference>
    </cac:DigitalSignatureAttachment>
  </cac:Signature>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${escapeXml(supplier.ruc)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${supplier.legalName}]]></cbc:RegistrationName>
        <cac:RegistrationAddress>
          <cbc:ID>${escapeXml(supplier.ubigeo)}</cbc:ID>
          <cbc:AddressTypeCode>0000</cbc:AddressTypeCode>
          <cac:AddressLine>
            <cbc:Line><![CDATA[${supplier.address}]]></cbc:Line>
          </cac:AddressLine>
        </cac:RegistrationAddress>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="${escapeXml(buyer.documentType)}" schemeName="Documento de Identidad" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${escapeXml(buyer.documentNumber)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName><![CDATA[${buyer.legalName}]]></cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${money(taxAmount)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currency}">${money(taxableAmount)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currency}">${money(taxAmount)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID schemeID="UN/ECE 5305" schemeName="Tax Category Identifier" schemeAgencyName="United Nations Economic Commission for Europe">${taxCategoryId}</cbc:ID>
        <cbc:Percent>${igvPercent}</cbc:Percent>
        ${taxExemptionReasonCode ? `<cbc:TaxExemptionReasonCode listAgencyName="PE:SUNAT" listName="Afectacion del IGV" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07">${taxExemptionReasonCode}</cbc:TaxExemptionReasonCode>` : ""}
        <cac:TaxScheme>
          <cbc:ID schemeName="Codigo de tributos" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05">${taxSchemeId}</cbc:ID>
          <cbc:Name>${taxSchemeName}</cbc:Name>
          <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${money(taxableAmount)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${money(lineExtensionAmount)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${currency}">${money(lineExtensionAmount)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="ZZ">${line.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${currency}">${money(taxableAmount)}</cbc:LineExtensionAmount>
    <cac:PricingReference>
      <cac:AlternativeConditionPrice>
        <cbc:PriceAmount currencyID="${currency}">${money(line.unitPrice)}</cbc:PriceAmount>
        <cbc:PriceTypeCode>01</cbc:PriceTypeCode>
      </cac:AlternativeConditionPrice>
    </cac:PricingReference>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${currency}">${money(taxAmount)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${currency}">${money(taxableAmount)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${currency}">${money(taxAmount)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:ID schemeID="UN/ECE 5305" schemeName="Tax Category Identifier" schemeAgencyName="United Nations Economic Commission for Europe">${taxCategoryId}</cbc:ID>
          <cbc:Percent>${igvPercent}</cbc:Percent>
          ${taxExemptionReasonCode ? `<cbc:TaxExemptionReasonCode listAgencyName="PE:SUNAT" listName="Afectacion del IGV" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07">${taxExemptionReasonCode}</cbc:TaxExemptionReasonCode>` : ""}
          <cac:TaxScheme>
            <cbc:ID schemeName="Codigo de tributos" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo05">${taxSchemeId}</cbc:ID>
            <cbc:Name>${taxSchemeName}</cbc:Name>
            <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Description><![CDATA[${line.description}]]></cbc:Description>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${currency}">${money(taxableAmount / line.quantity)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
}

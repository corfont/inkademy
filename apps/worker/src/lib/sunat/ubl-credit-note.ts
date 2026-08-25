// ============================================================================
// Construcción del XML UBL 2.1 para Nota de Crédito / Nota de Débito SUNAT.
//
// Misma estructura general que ubl-invoice.ts (mismo fix de firma en
// sign.ts aplica igual acá — no hay nada específico de nota que lo cambie),
// pero con el elemento raíz CreditNote/DebitNote y un cac:DiscrepancyResponse
// + cac:BillingReference que referencian el documento original que se ajusta.
// ============================================================================

export type SunatNoteType = "CREDIT" | "DEBIT";

export interface UblNoteInput {
  noteType: SunatNoteType;
  series: string;
  correlativo: number;
  issueDate: Date;
  currency: "PEN" | "USD";
  /** Documento original (boleta/factura) que esta nota ajusta. */
  reference: {
    documentTypeCode: "01" | "03"; // 01=Factura, 03=Boleta
    series: string;
    correlativo: number;
  };
  reasonCode: string; // catálogo 09 (crédito) / catálogo 10 (débito)
  reasonDescription: string;
  supplier: {
    ruc: string;
    legalName: string;
    address: string;
    ubigeo: string;
  };
  buyer: {
    documentType: string;
    documentNumber: string;
    legalName: string;
  };
  igvExempt: boolean;
  /** % de IGV vigente — parametrizable, ver SunatSettings.igvPercent. Default 18 si no se pasa. */
  igvPercent?: number;
  line: {
    description: string;
    quantity: number;
    unitPrice: number;
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

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

/** "CreditNote"/"DebitNote" como nombre de elemento raíz y de namespace UBL. */
function rootTag(noteType: SunatNoteType): { tag: string; ns: string; linePrefix: string; quantityTag: string; docId: string } {
  if (noteType === "CREDIT") {
    return {
      tag: "CreditNote",
      ns: "urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2",
      linePrefix: "CreditNoteLine",
      quantityTag: "CreditedQuantity",
      docId: "IDSignSP",
    };
  }
  return {
    tag: "DebitNote",
    ns: "urn:oasis:names:specification:ubl:schema:xsd:DebitNote-2",
    linePrefix: "DebitNoteLine",
    quantityTag: "DebitedQuantity",
    docId: "IDSignSP",
  };
}

/** Construye el XML UBL 2.1 (sin firmar) de una Nota de Crédito o Débito. */
export function buildUblNoteXml(input: UblNoteInput): string {
  const { noteType, series, correlativo, currency, reference, supplier, buyer, line } = input;
  const { tag, ns, linePrefix, quantityTag } = rootTag(noteType);
  const id = `${series}-${correlativo}`;
  const issueDate = formatPeruDate(input.issueDate);
  const referenceId = `${reference.series}-${reference.correlativo}`;

  const igvRate = input.igvPercent ?? 18;
  const lineExtensionAmount = line.quantity * line.unitPrice;
  const taxAmount = input.igvExempt ? 0 : lineExtensionAmount - lineExtensionAmount / (1 + igvRate / 100);
  const taxableAmount = lineExtensionAmount - taxAmount;
  const taxCategoryId = input.igvExempt ? "E" : "S";
  const taxExemptionReasonCode = input.igvExempt ? "20" : undefined;
  const igvPercent = input.igvExempt ? "0.00" : igvRate.toFixed(2);
  const taxSchemeId = input.igvExempt ? "9997" : "1000";
  const taxSchemeName = input.igvExempt ? "EXO" : "IGV";

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<${tag} xmlns="${ns}" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent></ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>2.0</cbc:CustomizationID>
  <cbc:ID>${escapeXml(id)}</cbc:ID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>
  <cac:DiscrepancyResponse>
    <cbc:ReferenceID>${escapeXml(referenceId)}</cbc:ReferenceID>
    <cbc:ResponseCode>${escapeXml(input.reasonCode)}</cbc:ResponseCode>
    <cbc:Description><![CDATA[${input.reasonDescription}]]></cbc:Description>
  </cac:DiscrepancyResponse>
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${escapeXml(referenceId)}</cbc:ID>
      <cbc:DocumentTypeCode>${reference.documentTypeCode}</cbc:DocumentTypeCode>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>
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
  <cac:${linePrefix}>
    <cbc:ID>1</cbc:ID>
    <cbc:${quantityTag} unitCode="ZZ">${line.quantity}</cbc:${quantityTag}>
    <cbc:LineExtensionAmount currencyID="${currency}">${money(taxableAmount)}</cbc:LineExtensionAmount>
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
  </cac:${linePrefix}>
</${tag}>`;
}

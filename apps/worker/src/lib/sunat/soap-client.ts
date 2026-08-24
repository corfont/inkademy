// ============================================================================
// Empaquetado ZIP + envío SOAP (sendBill) + parseo de la CDR de respuesta.
//
// Endpoints reales de SUNAT (confirmados contra el WSDL público al
// desarrollar esta integración):
//   BETA:       https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService
//   PRODUCCIÓN: https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService
// ============================================================================

import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

export type SunatEnv = "beta" | "production";

export function sunatEndpoint(env: SunatEnv): string {
  return env === "production"
    ? "https://e-factura.sunat.gob.pe/ol-ti-itcpfegem/billService"
    : "https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService";
}

/** Nombre de archivo exigido por SUNAT: {RUC}-{tipo doc.}-{serie}-{correlativo}. Catálogo 01: 01=Factura, 03=Boleta, 07=Nota de Crédito, 08=Nota de Débito. */
export function buildFileName(ruc: string, documentTypeCode: "01" | "03" | "07" | "08", series: string, correlativo: number): string {
  return `${ruc}-${documentTypeCode}-${series}-${correlativo}`;
}

export async function zipSignedXml(fileName: string, signedXml: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(`${fileName}.xml`, signedXml);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export interface SendBillParams {
  env: SunatEnv;
  /** Usuario secundario SOL SIN el RUC delante — se antepone aquí. */
  solUser: string;
  solPassword: string;
  ruc: string;
  fileName: string;
  zipBuffer: Buffer;
}

export interface SendBillResult {
  httpOk: boolean;
  /** true si SUNAT devolvió un ZIP con CDR (independientemente de si fue aceptado o rechazado con observaciones). */
  hasCdr: boolean;
  responseCode?: string;
  description?: string;
  rawFault?: string;
}

function buildSoapEnvelope(params: SendBillParams): string {
  const wsUsername = `${params.ruc}${params.solUser}`;
  const base64Zip = params.zipBuffer.toString("base64");
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:ser="http://service.sunat.gob.pe">
  <soapenv:Header>
    <wsse:Security>
      <wsse:UsernameToken>
        <wsse:Username>${wsUsername}</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${params.solPassword}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>
  <soapenv:Body>
    <ser:sendBill>
      <fileName>${params.fileName}.zip</fileName>
      <contentFile>${base64Zip}</contentFile>
    </ser:sendBill>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/** Extrae el .xml de la CDR (el zip también trae un directorio "dummy/" en algunas respuestas — no tomar la primera key a ciegas). */
async function extractCdrXml(cdrZipBase64: string): Promise<string | null> {
  const zip = await JSZip.loadAsync(Buffer.from(cdrZipBase64, "base64"));
  const xmlEntryName = Object.keys(zip.files).find((name) => name.toLowerCase().endsWith(".xml"));
  if (!xmlEntryName) return null;
  return zip.files[xmlEntryName].async("string");
}

export async function sendBill(params: SendBillParams): Promise<SendBillResult & { cdrXml?: string }> {
  const envelope = buildSoapEnvelope(params);

  const res = await fetch(sunatEndpoint(params.env), {
    method: "POST",
    headers: {
      "Content-Type": "text/xml;charset=UTF-8",
      SOAPAction: "urn:sendBill",
    },
    body: envelope,
  });

  const bodyText = await res.text();
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
  const parsed = parser.parse(bodyText);

  const fault = parsed?.Envelope?.Body?.Fault;
  if (fault) {
    const faultString = fault.faultstring ?? fault.detail ?? JSON.stringify(fault);
    return { httpOk: res.ok, hasCdr: false, rawFault: String(faultString) };
  }

  const applicationResponse: string | undefined = parsed?.Envelope?.Body?.sendBillResponse?.applicationResponse;
  if (!applicationResponse) {
    return { httpOk: res.ok, hasCdr: false, rawFault: bodyText.slice(0, 2000) };
  }

  const cdrXml = await extractCdrXml(applicationResponse);
  if (!cdrXml) {
    return { httpOk: res.ok, hasCdr: false, rawFault: "CDR sin archivo .xml dentro del zip" };
  }

  const cdrParsed = parser.parse(cdrXml);
  // La CDR es un ApplicationResponse UBL; el código/descripción vienen en DocumentResponse/Response.
  const responseNode = cdrParsed?.ApplicationResponse?.DocumentResponse?.Response;
  const responseCode = responseNode?.ResponseCode !== undefined ? String(responseNode.ResponseCode) : undefined;
  const description = responseNode?.Description !== undefined ? String(responseNode.Description) : undefined;

  return { httpOk: res.ok, hasCdr: true, responseCode, description, cdrXml };
}

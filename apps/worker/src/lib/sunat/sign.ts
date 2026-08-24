// ============================================================================
// Firma digital XMLDSig del comprobante UBL (enveloped, documento completo).
//
// FIX NO OBVIO (validado contra SUNAT beta real durante el desarrollo de
// esta integración): `addReference({ xpath: "/*", transforms, digestAlgorithm })`
// SIN especificar una URI vacía explícita hace que xml-crypto inyecte un
// atributo `Id="_0"` en el elemento raíz `<Invoice>`, que NO es un atributo
// válido del XSD de Invoice de UBL — SUNAT lo rechaza con HTTP 500 y
// "cvc-complex-type.3.2.2: ... had undefined attribute Id". La solución es
// pasar `uri: "", isEmptyUri: true` explícitamente: produce una firma
// enveloped de documento completo sin tocar el elemento raíz. Con este
// fix, un envío de prueba contra e-beta.sunat.gob.pe devolvió HTTP 200 y
// CDR con ResponseCode 0 ("... ha sido aceptada"). No revertir este detalle
// sin volver a probar contra BETA.
// ============================================================================

import * as forge from "node-forge";
import { SignedXml } from "xml-crypto";

export interface SunatCertificate {
  certPem: string;
  keyPem: string;
}

let cachedSelfSignedCert: SunatCertificate | null = null;

/**
 * Genera (una sola vez por proceso) un certificado autofirmado RSA-2048.
 * Válido para el ambiente BETA de SUNAT (que no exige una CA acreditada);
 * en PRODUCCIÓN, SUNAT exige un certificado digital emitido por una
 * entidad certificadora acreditada — configurar `SUNAT_CERT_PEM` /
 * `SUNAT_CERT_KEY_PEM` con ese certificado real antes de pasar a producción.
 */
function getOrCreateSelfSignedCert(commonName: string): SunatCertificate {
  if (cachedSelfSignedCert) return cachedSelfSignedCert;

  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 5);

  const attrs = [
    { name: "commonName", value: commonName },
    { name: "countryName", value: "PE" },
    { shortName: "O", value: "Inkademy SAC" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  cachedSelfSignedCert = {
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
  };
  return cachedSelfSignedCert;
}

export function resolveSunatCertificate(rucForCommonName: string, certPem?: string, keyPem?: string): SunatCertificate {
  if (certPem && keyPem) {
    // Permite pegar el PEM con "\n" literales en la env var (patrón común
    // en .env de una sola línea).
    return { certPem: certPem.replace(/\\n/g, "\n"), keyPem: keyPem.replace(/\\n/g, "\n") };
  }
  return getOrCreateSelfSignedCert(rucForCommonName);
}

/** Firma el XML UBL (sin firmar, con el `ext:ExtensionContent` vacío) y devuelve el XML completo firmado. */
export function signUblXml(unsignedXml: string, cert: SunatCertificate): string {
  const sig = new SignedXml({
    privateKey: cert.keyPem,
    publicCert: cert.certPem,
    signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
    canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
  });

  sig.addReference({
    xpath: "/*",
    uri: "",
    isEmptyUri: true,
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    ],
    digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
  });

  sig.computeSignature(unsignedXml, {
    prefix: "ds",
    location: {
      reference: "//*[local-name(.)='ExtensionContent']",
      action: "append",
    },
  });

  return sig.getSignedXml();
}

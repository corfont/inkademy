#!/usr/bin/env node
// Descifra un respaldo cifrado por el worker (formato INKBK1, AES-256-GCM).
// Uso: BACKUP_ENCRYPTION_KEY=<base64> node scripts/decrypt-backup.mjs <respaldo.zip.enc> <salida.zip>
import { createDecipheriv } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const [, , input, output] = process.argv;
const keyB64 = process.env.BACKUP_ENCRYPTION_KEY;
if (!input || !output || !keyB64) {
  console.error("Uso: BACKUP_ENCRYPTION_KEY=<base64> node scripts/decrypt-backup.mjs <respaldo.zip.enc> <salida.zip>");
  process.exit(1);
}
const buf = readFileSync(input);
if (buf.subarray(0, 6).toString() !== "INKBK1") {
  console.error("El archivo no tiene el formato de respaldo cifrado de Inkademy (INKBK1).");
  process.exit(1);
}
const iv = buf.subarray(6, 18);
const tag = buf.subarray(18, 34);
const body = buf.subarray(34);
const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyB64, "base64"), iv);
decipher.setAuthTag(tag);
try {
  writeFileSync(output, Buffer.concat([decipher.update(body), decipher.final()]));
  console.log(`Descifrado en ${output}`);
} catch {
  console.error("No se pudo descifrar: la clave no corresponde o el archivo está dañado.");
  process.exit(1);
}

import { createCipheriv, randomBytes } from "node:crypto";
import { prisma } from "@inkademy/db";
import { getSharePointToken, resolveSharePointFolder, uploadToSharePoint } from "@inkademy/shared";
import { createLogger } from "./logger";

const logger = createLogger("offsite-backup");

/** Cabecera del archivo cifrado: permite reconocerlo y cambiar el formato más adelante. */
const MAGIC = Buffer.from("INKBK1");

export interface OffsiteResult {
  status: "OK" | "FAILED" | "SKIPPED" | null;
  url?: string;
  note?: string;
  encrypted: boolean;
}

/**
 * Cifrado opcional AES-256-GCM con BACKUP_ENCRYPTION_KEY (32 bytes en base64:
 * `openssl rand -base64 32`). Formato: "INKBK1" + iv(12) + tag(16) + datos.
 * Descifrar: `node scripts/decrypt-backup.mjs <archivo.enc> <salida.zip>`.
 *
 * ⚠ La clave NO debe vivir solo en este servidor: si el servidor se pierde, una
 * copia cifrada sin su clave es irrecuperable. Guárdala también en un gestor de
 * contraseñas. Por eso el cifrado es opt-in y la pantalla avisa si está apagado.
 */
export function encryptBackup(zip: Buffer): { data: Buffer; encrypted: boolean } {
  const b64 = process.env.BACKUP_ENCRYPTION_KEY;
  if (!b64) return { data: zip, encrypted: false };
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY debe ser de 32 bytes en base64 (openssl rand -base64 32).");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(zip), cipher.final()]);
  return { data: Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]), encrypted: true };
}

/**
 * Sube el respaldo ya verificado a la carpeta de SharePoint que configuró el admin.
 * NUNCA lanza: un fallo de la copia externa no debe convertir en fallido un respaldo
 * que sí se generó y verificó — queda registrado aparte (offsiteStatus) y visible.
 */
export async function copyBackupOffsite(zip: Buffer, createdAt: Date): Promise<OffsiteResult> {
  try {
    const settings = await prisma.backupSettings.findUnique({ where: { id: "default" } });
    if (!settings?.sharepointEnabled || !settings.sharepointFolderUrl) return { status: null, encrypted: false };

    const { MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET } = process.env;
    if (!MS_TENANT_ID || !MS_CLIENT_ID || !MS_CLIENT_SECRET) {
      return { status: "SKIPPED", note: "El servidor no tiene las credenciales de Microsoft (MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET).", encrypted: false };
    }

    const { data, encrypted } = encryptBackup(zip);
    const token = await getSharePointToken({ tenantId: MS_TENANT_ID, clientId: MS_CLIENT_ID, clientSecret: MS_CLIENT_SECRET });
    const folder = await resolveSharePointFolder(token, settings.sharepointFolderUrl);
    const stamp = createdAt.toISOString().replace(/[:.]/g, "-");
    const uploaded = await uploadToSharePoint(token, folder, `inkademy-respaldo-${stamp}.zip${encrypted ? ".enc" : ""}`, data);
    logger.info("copia externa subida", { folder: folder.name, bytes: data.byteLength, encrypted });
    return { status: "OK", url: uploaded.webUrl, note: `Guardado en «${folder.name}»${encrypted ? " (cifrado)" : " (sin cifrar)"}.`, encrypted };
  } catch (err) {
    const note = err instanceof Error ? err.message : String(err);
    logger.error("no se pudo subir la copia externa", { err: note });
    return { status: "FAILED", note: note.slice(0, 500), encrypted: false };
  }
}

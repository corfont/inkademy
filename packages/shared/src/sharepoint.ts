/**
 * Cliente mínimo de SharePoint/OneDrive vía Microsoft Graph, sin dependencias.
 * Lo usan la API (probar la conexión desde el panel) y el worker (subir la copia
 * externa de cada respaldo) — por eso vive aquí y no en una de las dos apps.
 *
 * Autenticación: credenciales de APLICACIÓN (client credentials) de la app
 * registrada en Azure (las mismas MS_TENANT_ID / MS_CLIENT_ID / MS_CLIENT_SECRET
 * que ya usa Teams). La app necesita permiso de aplicación `Sites.ReadWrite.All`
 * o `Files.ReadWrite.All` con consentimiento de administrador (o `Sites.Selected`
 * concedido a ese sitio). Sin eso Graph responde 401/403 y el mensaje lo explica.
 *
 * La ruta se identifica con el ENLACE de la carpeta (SharePoint → Compartir →
 * Copiar vínculo, o la dirección de la carpeta en el navegador): Graph lo resuelve
 * con la API /shares, así no hay que adivinar ids de sitio ni de biblioteca.
 */

export interface SharePointCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export interface SharePointFolder {
  driveId: string;
  itemId: string;
  name: string;
  webUrl: string;
}

export class SharePointError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "SharePointError";
  }
}

const GRAPH = "https://graph.microsoft.com/v1.0";
// Graph exige fragmentos múltiplos de 320 KiB; 5 MiB = 16 × 320 KiB.
const CHUNK_SIZE = 5 * 1024 * 1024;
// Por debajo de 4 MB Graph admite un PUT simple; por encima exige sesión de carga.
const SIMPLE_UPLOAD_MAX = 4 * 1024 * 1024;

function explain(status: number, body: string, action: string): SharePointError {
  let detail = body;
  try {
    const j = JSON.parse(body) as { error?: { message?: string; code?: string } };
    detail = j.error?.message ?? j.error?.code ?? body;
  } catch {
    // cuerpo no JSON: se deja tal cual
  }
  detail = detail.slice(0, 300);
  if (status === 401 || status === 403) {
    return new SharePointError(
      `Microsoft rechazó el acceso (${status}) al ${action}. La aplicación de Azure necesita el permiso de aplicación «Sites.ReadWrite.All» (o «Files.ReadWrite.All») con consentimiento de administrador, o «Sites.Selected» concedido a ese sitio. Detalle: ${detail}`,
      status,
    );
  }
  if (status === 404) {
    return new SharePointError(
      `No se encontró la carpeta (404) al ${action}. Revisa que el enlace sea el de una CARPETA de SharePoint y que la aplicación de Azure tenga acceso a ese sitio. Detalle: ${detail}`,
      status,
    );
  }
  return new SharePointError(`Microsoft Graph respondió ${status} al ${action}: ${detail}`, status);
}

/** Token de aplicación para Microsoft Graph. */
export async function getSharePointToken(creds: SharePointCredentials): Promise<string> {
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(creds.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      scope: "https://graph.microsoft.com/.default",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new SharePointError(
      `No se pudo iniciar sesión en Microsoft con las credenciales del servidor (${res.status}). Revisa MS_TENANT_ID, MS_CLIENT_ID y MS_CLIENT_SECRET (¿venció el secreto?). Detalle: ${text.slice(0, 200)}`,
      res.status,
    );
  }
  const token = (JSON.parse(text) as { access_token?: string }).access_token;
  if (!token) throw new SharePointError("Microsoft no devolvió un token de acceso.");
  return token;
}

/** Codificación que pide la API /shares: «u!» + base64url del enlace. */
export function encodeShareUrl(url: string): string {
  const b64 = btoa(unescape(encodeURIComponent(url.trim())));
  return "u!" + b64.replace(/=+$/, "").replace(/\//g, "_").replace(/\+/g, "-");
}

/** Resuelve el enlace de una carpeta a su unidad (drive) y elemento (item) en Graph. */
export async function resolveSharePointFolder(token: string, folderUrl: string): Promise<SharePointFolder> {
  if (!/^https:\/\/[^/\s]+\.sharepoint\.com\//i.test(folderUrl.trim())) {
    throw new SharePointError("El enlace debe ser una dirección de SharePoint (https://…sharepoint.com/…).");
  }
  const res = await fetch(`${GRAPH}/shares/${encodeShareUrl(folderUrl)}/driveItem?$select=id,name,webUrl,folder,parentReference`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) throw explain(res.status, text, "abrir la carpeta");
  const item = JSON.parse(text) as { id: string; name: string; webUrl: string; folder?: unknown; parentReference?: { driveId?: string } };
  if (!item.folder) throw new SharePointError("El enlace apunta a un archivo, no a una carpeta. Copia el vínculo de la carpeta donde quieres guardar los respaldos.");
  const driveId = item.parentReference?.driveId;
  if (!driveId) throw new SharePointError("Microsoft no indicó a qué biblioteca pertenece la carpeta.");
  return { driveId, itemId: item.id, name: item.name, webUrl: item.webUrl };
}

/** Sube un archivo dentro de la carpeta. Si ya existe uno con ese nombre, SharePoint le agrega un sufijo (nunca pisa). */
export async function uploadToSharePoint(
  token: string,
  folder: SharePointFolder,
  fileName: string,
  data: Uint8Array,
): Promise<{ id: string; webUrl: string }> {
  const safeName = encodeURIComponent(fileName);
  const base = `${GRAPH}/drives/${folder.driveId}/items/${folder.itemId}:/${safeName}:`;

  if (data.byteLength <= SIMPLE_UPLOAD_MAX) {
    const res = await fetch(`${base}/content?@microsoft.graph.conflictBehavior=rename`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
      body: data as unknown as BodyInit,
      signal: AbortSignal.timeout(120_000),
    });
    const text = await res.text();
    if (!res.ok) throw explain(res.status, text, "subir el archivo");
    const j = JSON.parse(text) as { id: string; webUrl: string };
    return { id: j.id, webUrl: j.webUrl };
  }

  const sessionRes = await fetch(`${base}/createUploadSession`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "rename", name: fileName } }),
    signal: AbortSignal.timeout(30_000),
  });
  const sessionText = await sessionRes.text();
  if (!sessionRes.ok) throw explain(sessionRes.status, sessionText, "iniciar la subida");
  const uploadUrl = (JSON.parse(sessionText) as { uploadUrl?: string }).uploadUrl;
  if (!uploadUrl) throw new SharePointError("Microsoft no devolvió la dirección de subida.");

  const total = data.byteLength;
  for (let start = 0; start < total; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, total) - 1;
    const chunk = data.subarray(start, end + 1);
    // La dirección de subida ya lleva su propia autorización: NO se envía el token de Graph.
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Length": String(chunk.byteLength), "Content-Range": `bytes ${start}-${end}/${total}` },
      body: chunk as unknown as BodyInit,
      signal: AbortSignal.timeout(180_000),
    });
    const text = await res.text();
    if (res.status === 200 || res.status === 201) {
      const j = JSON.parse(text) as { id: string; webUrl: string };
      return { id: j.id, webUrl: j.webUrl };
    }
    if (res.status !== 202) {
      // Se libera la sesión para no dejar un archivo a medias.
      await fetch(uploadUrl, { method: "DELETE" }).catch(() => undefined);
      throw explain(res.status, text, "subir el archivo");
    }
  }
  throw new SharePointError("La subida terminó sin que Microsoft confirmara el archivo.");
}

export async function deleteSharePointItem(token: string, driveId: string, itemId: string): Promise<void> {
  await fetch(`${GRAPH}/drives/${driveId}/items/${itemId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  }).catch(() => undefined);
}

/**
 * Prueba de punta a punta: inicia sesión, abre la carpeta y escribe (y borra) un archivo
 * diminuto — así se demuestra el permiso de ESCRITURA, no solo que el enlace existe.
 */
export async function testSharePointConnection(
  creds: SharePointCredentials,
  folderUrl: string,
): Promise<{ ok: boolean; note: string; folderName?: string }> {
  try {
    const token = await getSharePointToken(creds);
    const folder = await resolveSharePointFolder(token, folderUrl);
    const probe = new TextEncoder().encode(`Prueba de conexión de Inkademy — ${new Date().toISOString()}`);
    const uploaded = await uploadToSharePoint(token, folder, `inkademy-prueba-${Date.now()}.txt`, probe);
    await deleteSharePointItem(token, folder.driveId, uploaded.id);
    return { ok: true, note: `Conexión correcta: se pudo escribir en la carpeta «${folder.name}».`, folderName: folder.name };
  } catch (err) {
    return { ok: false, note: err instanceof Error ? err.message : String(err) };
  }
}

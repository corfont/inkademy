/**
 * "¿Colores, tipos de letra, tamaño, como lo hacen los mejores?" — un
 * paquete SCORM debe reproducirse offline/autocontenido, así que una
 * tipografía de marca (Google Fonts) no se puede simplemente enlazar como
 * hace el resto de la plataforma (apps/web/src/lib/brand-fonts.ts). Este
 * helper la INCRUSTA como datos en el momento de generar el paquete: pide
 * la hoja de estilos real a Google Fonts, extrae las URLs de los .woff2
 * reales, los descarga, y los reemplaza por data-URIs directamente en el
 * texto CSS devuelto (que ya trae la sintaxis @font-face completa) — el
 * .zip final queda 100% autocontenido, con tipografía de marca real.
 *
 * Best-effort a propósito (como certificados/notificaciones en esta misma
 * sesión): si falla cualquier paso (sin red, timeout, Google Fonts caído),
 * retorna null — ScormService cae a la fuente de sistema del tema sin
 * bloquear al docente.
 */
const FETCH_TIMEOUT_MS = 8000;

export async function fetchEmbeddedFontFaceCss(googleName: string, weights: number[] = [400, 700]): Promise<string | null> {
  try {
    const familyParam = encodeURIComponent(googleName).replace(/%20/g, "+");
    const cssUrl = `https://fonts.googleapis.com/css2?family=${familyParam}:wght@${weights.join(";")}&display=swap`;
    const cssRes = await fetch(cssUrl, {
      // Google Fonts sirve formatos distintos según el User-Agent — uno
      // moderno garantiza woff2 (el más liviano), no el legado ttf/eot.
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!cssRes.ok) return null;
    let cssText = await cssRes.text();

    const fontUrls = [...cssText.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map((m) => m[1]);
    if (fontUrls.length === 0) return null;

    for (const fontUrl of fontUrls) {
      const fontRes = await fetch(fontUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!fontRes.ok) continue;
      const buf = Buffer.from(await fontRes.arrayBuffer());
      const mime = fontUrl.endsWith(".woff2") ? "font/woff2" : fontUrl.endsWith(".woff") ? "font/woff" : "font/ttf";
      cssText = cssText.split(fontUrl).join(`data:${mime};base64,${buf.toString("base64")}`);
    }
    return cssText;
  } catch {
    return null;
  }
}

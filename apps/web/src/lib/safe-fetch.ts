/**
 * apps/api se está construyendo en paralelo: durante desarrollo puede no
 * estar disponible. Esta utilidad intenta la llamada real y, si falla por
 * red (API caída/no desplegada), devuelve datos simulados razonables para
 * que la pantalla siga siendo navegable — marcando `live: false` para que
 * la página pueda, si quiere, mostrar un aviso discreto.
 */
export async function withFallback<T>(fn: () => Promise<T>, fallback: T): Promise<{ data: T; live: boolean }> {
  try {
    const data = await fn();
    return { data, live: true };
  } catch {
    return { data: fallback, live: false };
  }
}

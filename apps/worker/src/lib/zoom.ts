import { createLogger } from "./logger";

const logger = createLogger("zoom");

const ZOOM_API_BASE = "https://api.zoom.us/v2";
const ZOOM_OAUTH_URL = "https://zoom.us/oauth/token";

export function isZoomConfigured(): boolean {
  return Boolean(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
}

let cachedToken: { value: string; expiresAt: number } | null = null;

/**
 * Mismo S2S OAuth que apps/api/.../providers/zoom.provider.ts — se
 * reimplementa acá (no se comparte código NestJS entre api y worker, mismo
 * criterio que las constantes de colas, ver queues.ts) con su propio cache
 * en memoria del proceso worker.
 */
async function getAccessToken(): Promise<string | null> {
  if (!isZoomConfigured()) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const basic = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${ZOOM_OAUTH_URL}?grant_type=account_credentials&account_id=${process.env.ZOOM_ACCOUNT_ID}`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!res.ok) {
    logger.error("Zoom OAuth token falló", { status: res.status, body: await res.text() });
    return null;
  }
  const body = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

export interface ZoomAttendanceRecord {
  email: string;
  joinedAt: Date | null;
  leftAt: Date | null;
  durationMin: number | null;
}

/** Mismo cálculo que ZoomProvider.getAttendanceReport (agrupa por correo, suma duraciones). */
export async function fetchZoomAttendanceRecords(providerMeetingId: string): Promise<ZoomAttendanceRecord[]> {
  const token = await getAccessToken();
  if (!token) return [];

  const byEmail = new Map<string, { joinedAt: Date | null; leftAt: Date | null; totalSeconds: number }>();
  let nextPageToken: string | undefined;
  do {
    const url = new URL(`${ZOOM_API_BASE}/report/meetings/${providerMeetingId}/participants`);
    url.searchParams.set("page_size", "300");
    if (nextPageToken) url.searchParams.set("next_page_token", nextPageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      logger.error("Zoom report/participants falló", { status: res.status, body: await res.text() });
      return [];
    }
    const body = (await res.json()) as {
      participants?: { user_email?: string; email?: string; join_time?: string; leave_time?: string; duration?: number }[];
      next_page_token?: string;
    };
    for (const p of body.participants ?? []) {
      const email: string | undefined = p.user_email || p.email;
      if (!email) continue;
      const joinedAt = p.join_time ? new Date(p.join_time) : null;
      const leftAt = p.leave_time ? new Date(p.leave_time) : null;
      const existing = byEmail.get(email) ?? { joinedAt: null, leftAt: null, totalSeconds: 0 };
      existing.totalSeconds += p.duration ?? 0;
      if (joinedAt && (!existing.joinedAt || joinedAt < existing.joinedAt)) existing.joinedAt = joinedAt;
      if (leftAt && (!existing.leftAt || leftAt > existing.leftAt)) existing.leftAt = leftAt;
      byEmail.set(email, existing);
    }
    nextPageToken = body.next_page_token || undefined;
  } while (nextPageToken);

  return [...byEmail.entries()].map(([email, v]) => ({
    email,
    joinedAt: v.joinedAt,
    leftAt: v.leftAt,
    durationMin: v.totalSeconds ? Math.round(v.totalSeconds / 60) : null,
  }));
}

/** Mismo criterio que ZoomProvider.getRecordingUrl — 404 = todavía procesándose, no es un error. */
export async function fetchZoomRecordingUrl(providerMeetingId: string): Promise<string | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const res = await fetch(`${ZOOM_API_BASE}/meetings/${providerMeetingId}/recordings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    logger.error("Zoom meetings/recordings GET falló", { status: res.status, body: await res.text() });
    return null;
  }
  const body = (await res.json()) as { recording_files?: { recording_type?: string; file_type?: string; play_url?: string }[] };
  const files = body.recording_files ?? [];
  const preferred =
    files.find((f) => f.recording_type === "shared_screen_with_speaker_view") ??
    files.find((f) => f.file_type === "MP4") ??
    files[0];
  return preferred?.play_url ?? null;
}

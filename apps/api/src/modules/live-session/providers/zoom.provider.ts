import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomUUID } from "crypto";
import type {
  AttendanceRecord,
  CreateMeetingParams,
  CreateMeetingResult,
  UpdateMeetingParams,
  VirtualClassroomProvider,
} from "./virtual-classroom-provider.interface";

const ZOOM_API_BASE = "https://api.zoom.us/v2";
const ZOOM_OAUTH_URL = "https://zoom.us/oauth/token";

/**
 * "Zoom por defecto, Teams como segunda opción" — adapter de Zoom vía
 * Server-to-Server OAuth (app tipo "Server-to-Server OAuth" en
 * marketplace.zoom.us, scopes meeting:write:admin, meeting:read:admin,
 * report:read:admin). Las reuniones se crean como userId="me" — para un
 * token S2S eso resuelve al dueño de la cuenta (confirmado en vivo contra
 * la cuenta real: host_email correcto), no hace falta pedir el correo de
 * un usuario aparte como sí exige Teams (organizerUpn).
 *
 * Si ZOOM_ACCOUNT_ID/ZOOM_CLIENT_ID/ZOOM_CLIENT_SECRET no están
 * configurados, degrada a modo "simulado" — mismo criterio que
 * TeamsProvider, para no romper el flujo de desarrollo sin credenciales.
 */
@Injectable()
export class ZoomProvider implements VirtualClassroomProvider {
  private readonly logger = new Logger(ZoomProvider.name);
  private readonly accountId?: string;
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {
    this.accountId = this.config.get<string>("ZOOM_ACCOUNT_ID");
    this.clientId = this.config.get<string>("ZOOM_CLIENT_ID");
    this.clientSecret = this.config.get<string>("ZOOM_CLIENT_SECRET");
    if (!this.accountId || !this.clientId || !this.clientSecret) {
      this.logger.warn("ZOOM_ACCOUNT_ID/ZOOM_CLIENT_ID/ZOOM_CLIENT_SECRET no configurados — ZoomProvider funcionará en modo SIMULADO");
    }
  }

  private get configured() {
    return Boolean(this.accountId && this.clientId && this.clientSecret);
  }

  private async getAccessToken(): Promise<string | null> {
    if (!this.configured) return null;
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now() + 60_000) return this.cachedToken.value;

    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const res = await fetch(`${ZOOM_OAUTH_URL}?grant_type=account_credentials&account_id=${this.accountId}`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}` },
    });
    if (!res.ok) {
      this.logger.error(`Zoom OAuth token falló (${res.status}): ${await res.text()}`);
      return null;
    }
    const body = await res.json();
    this.cachedToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
    return this.cachedToken.value;
  }

  async createMeeting(params: CreateMeetingParams): Promise<CreateMeetingResult> {
    const token = await this.getAccessToken();
    if (!token) {
      const simulatedId = `simulated-${randomUUID()}`;
      this.logger.warn(`[SIMULADO] Creando reunión de Zoom placeholder para "${params.subject}" (${simulatedId})`);
      return { providerMeetingId: simulatedId, joinUrl: `https://zoom.us/j/simulated/${simulatedId}`, simulated: true };
    }

    const durationMinutes = Math.max(1, Math.round((params.endsAt.getTime() - params.startsAt.getTime()) / 60_000));
    const res = await fetch(`${ZOOM_API_BASE}/users/me/meetings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        topic: params.subject,
        type: 2, // scheduled
        start_time: params.startsAt.toISOString(),
        duration: durationMinutes,
        timezone: "UTC",
        // "Implementar la grabación de clases" — se graba en la nube de Zoom
        // por defecto, sin que el docente tenga que activarlo a mano cada
        // vez; getRecordingUrl la recoge después (ver syncAttendance).
        settings: { join_before_host: false, waiting_room: true, auto_recording: "cloud" },
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      this.logger.error(`Zoom meetings POST falló (${res.status}): ${errBody}`);
      throw new Error(`No se pudo crear la reunión de Zoom (status ${res.status})`);
    }
    const body = await res.json();
    return { providerMeetingId: String(body.id), joinUrl: body.join_url, simulated: false };
  }

  async updateMeeting(providerMeetingId: string, _organizerUpn: string, params: UpdateMeetingParams): Promise<void> {
    if (providerMeetingId.startsWith("simulated-")) {
      this.logger.warn(`[SIMULADO] Reprogramando reunión placeholder ${providerMeetingId} — no hay nada real que actualizar`);
      return;
    }
    const token = await this.getAccessToken();
    if (!token) return;

    const durationMinutes = Math.max(1, Math.round((params.endsAt.getTime() - params.startsAt.getTime()) / 60_000));
    const res = await fetch(`${ZOOM_API_BASE}/meetings/${providerMeetingId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ start_time: params.startsAt.toISOString(), duration: durationMinutes, timezone: "UTC" }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      this.logger.error(`Zoom meetings PATCH falló (${res.status}): ${errBody}`);
      throw new Error(`No se pudo reprogramar la reunión de Zoom (status ${res.status})`);
    }
  }

  /**
   * Report API (report:read:admin) — a diferencia de Graph (un solo reporte
   * con intervalos por persona), Zoom devuelve una fila por CADA vez que un
   * participante entró/salió (puede reunir varias si se desconectó y
   * volvió a entrar); se agrupan por correo sumando duration y tomando el
   * primer join / último leave.
   */
  async getAttendanceReport(providerMeetingId: string, _organizerUpn: string): Promise<AttendanceRecord[]> {
    if (providerMeetingId.startsWith("simulated-")) {
      this.logger.warn(`[SIMULADO] No hay reporte real de asistencia para ${providerMeetingId}`);
      return [];
    }
    const token = await this.getAccessToken();
    if (!token) return [];

    const byEmail = new Map<string, { joinedAt: Date | null; leftAt: Date | null; totalSeconds: number }>();
    let nextPageToken: string | undefined;
    do {
      const url = new URL(`${ZOOM_API_BASE}/report/meetings/${providerMeetingId}/participants`);
      url.searchParams.set("page_size", "300");
      if (nextPageToken) url.searchParams.set("next_page_token", nextPageToken);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        this.logger.error(`Zoom report/participants falló (${res.status}): ${await res.text()}`);
        return [];
      }
      const body = await res.json();
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

  /**
   * Cloud Recordings API — Zoom tarda un rato (minutos, a veces más) en
   * terminar de procesar la grabación después de que termina la clase, así
   * que un 404 justo al terminar es esperado (no un error real): se
   * devuelve null y quien llama simplemente reintenta más tarde (ver el
   * reintento periódico de la cola "attendance-sync" en el worker).
   */
  async getRecordingUrl(providerMeetingId: string): Promise<string | null> {
    if (providerMeetingId.startsWith("simulated-")) return null;
    const token = await this.getAccessToken();
    if (!token) return null;

    const res = await fetch(`${ZOOM_API_BASE}/meetings/${providerMeetingId}/recordings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) return null; // todavía no hay grabación (no se grabó, o Zoom no terminó de procesarla)
    if (!res.ok) {
      this.logger.error(`Zoom meetings/recordings GET falló (${res.status}): ${await res.text()}`);
      return null;
    }
    const body = await res.json();
    const files: { recording_type?: string; file_type?: string; play_url?: string }[] = body.recording_files ?? [];
    const preferred =
      files.find((f) => f.recording_type === "shared_screen_with_speaker_view") ??
      files.find((f) => f.file_type === "MP4") ??
      files[0];
    return preferred?.play_url ?? null;
  }
}

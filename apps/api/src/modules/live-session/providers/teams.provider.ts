import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ConfidentialClientApplication } from "@azure/msal-node";
import { randomUUID } from "crypto";
import type {
  AttendanceRecord,
  CreateMeetingParams,
  CreateMeetingResult,
  VirtualClassroomProvider,
} from "./virtual-classroom-provider.interface";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

/**
 * Adapter de Microsoft Teams vía Graph API (client-credentials, @azure/msal-node).
 * Requiere el permiso de aplicación `OnlineMeetings.ReadWrite.All` con
 * consentimiento de administrador en Azure AD (MS_TENANT_ID/MS_CLIENT_ID/MS_CLIENT_SECRET).
 *
 * Si esas credenciales no están configuradas, degrada a modo "simulado":
 * genera un joinUrl de placeholder y lo indica por log, para no romper el
 * flujo de desarrollo (docker-compose local no trae un tenant de Azure AD real).
 */
@Injectable()
export class TeamsProvider implements VirtualClassroomProvider {
  private readonly logger = new Logger(TeamsProvider.name);
  private readonly msalClient: ConfidentialClientApplication | null;

  constructor(private readonly config: ConfigService) {
    const tenantId = this.config.get<string>("MS_TENANT_ID");
    const clientId = this.config.get<string>("MS_CLIENT_ID");
    const clientSecret = this.config.get<string>("MS_CLIENT_SECRET");

    this.msalClient =
      tenantId && clientId && clientSecret
        ? new ConfidentialClientApplication({
            auth: {
              clientId,
              clientSecret,
              authority: `https://login.microsoftonline.com/${tenantId}`,
            },
          })
        : null;

    if (!this.msalClient) {
      this.logger.warn(
        "MS_TENANT_ID/MS_CLIENT_ID/MS_CLIENT_SECRET no configurados — TeamsProvider funcionará en modo SIMULADO",
      );
    }
  }

  private async getAccessToken(): Promise<string | null> {
    if (!this.msalClient) return null;
    const result = await this.msalClient.acquireTokenByClientCredential({
      scopes: ["https://graph.microsoft.com/.default"],
    });
    return result?.accessToken ?? null;
  }

  async createMeeting(params: CreateMeetingParams): Promise<CreateMeetingResult> {
    const token = await this.getAccessToken();
    if (!token) {
      const simulatedId = `simulated-${randomUUID()}`;
      this.logger.warn(
        `[SIMULADO] Creando reunión de Teams placeholder para "${params.subject}" (${simulatedId})`,
      );
      return {
        providerMeetingId: simulatedId,
        joinUrl: `https://teams.microsoft.com/l/meetup-join/simulated/${simulatedId}`,
        simulated: true,
      };
    }

    const res = await fetch(`${GRAPH_BASE}/users/${encodeURIComponent(params.organizerUpn)}/onlineMeetings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        subject: params.subject,
        startDateTime: params.startsAt.toISOString(),
        endDateTime: params.endsAt.toISOString(),
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      this.logger.error(`Graph onlineMeetings falló (${res.status}): ${errBody}`);
      throw new Error(`No se pudo crear la reunión de Teams (status ${res.status})`);
    }

    const body = await res.json();
    return { providerMeetingId: body.id, joinUrl: body.joinWebUrl, simulated: false };
  }

  async getAttendanceReport(providerMeetingId: string, organizerUpn: string): Promise<AttendanceRecord[]> {
    if (providerMeetingId.startsWith("simulated-")) {
      this.logger.warn(`[SIMULADO] No hay reporte real de asistencia para ${providerMeetingId}`);
      return [];
    }
    const token = await this.getAccessToken();
    if (!token) return [];

    const base = `${GRAPH_BASE}/users/${encodeURIComponent(organizerUpn)}/onlineMeetings/${providerMeetingId}/attendanceReports`;
    const reportsRes = await fetch(base, { headers: { Authorization: `Bearer ${token}` } });
    if (!reportsRes.ok) {
      this.logger.error(`No se pudo listar attendanceReports (${reportsRes.status})`);
      return [];
    }
    const reports = await reportsRes.json();
    const latestReportId = reports?.value?.[0]?.id;
    if (!latestReportId) return [];

    const recordsRes = await fetch(`${base}/${latestReportId}/attendanceRecords`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!recordsRes.ok) {
      this.logger.error(`No se pudo obtener attendanceRecords (${recordsRes.status})`);
      return [];
    }
    const records = await recordsRes.json();
    return (records?.value ?? []).map((r: any) => {
      const intervals = r.attendanceIntervals ?? [];
      const joinedAt = intervals[0]?.joinDateTime ? new Date(intervals[0].joinDateTime) : null;
      const last = intervals[intervals.length - 1];
      const leftAt = last?.leaveDateTime ? new Date(last.leaveDateTime) : null;
      const totalSeconds = intervals.reduce((sum: number, i: any) => sum + (i.durationInSeconds ?? 0), 0);
      return {
        email: r.emailAddress ?? r.identity?.displayName ?? "unknown",
        joinedAt,
        leftAt,
        durationMin: totalSeconds ? Math.round(totalSeconds / 60) : null,
      };
    });
  }
}

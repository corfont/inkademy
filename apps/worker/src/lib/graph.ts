import { ConfidentialClientApplication } from "@azure/msal-node";
import { createLogger } from "./logger";

const logger = createLogger("graph");

export function isGraphConfigured(): boolean {
  return Boolean(process.env.MS_TENANT_ID && process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET);
}

let msalApp: ConfidentialClientApplication | null = null;

function getMsalApp(): ConfidentialClientApplication {
  if (msalApp) return msalApp;
  msalApp = new ConfidentialClientApplication({
    auth: {
      clientId: process.env.MS_CLIENT_ID!,
      authority: `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}`,
      clientSecret: process.env.MS_CLIENT_SECRET!,
    },
  });
  return msalApp;
}

/**
 * Token de aplicación (client credentials) para llamar a Microsoft Graph
 * como aplicación (no delegado). Requiere el permiso de aplicación
 * `OnlineMeetings.ReadWrite.All` con consentimiento de administrador
 * (ver docs/DEPLOYMENT.md). Devuelve null si no hay credenciales configuradas
 * — quien llama debe registrar el log y omitir el trabajo, sin fallar.
 */
export async function getGraphAppToken(): Promise<string | null> {
  if (!isGraphConfigured()) {
    logger.warn("MS Graph no configurado (MS_TENANT_ID/MS_CLIENT_ID/MS_CLIENT_SECRET ausentes) — se omite");
    return null;
  }
  try {
    const result = await getMsalApp().acquireTokenByClientCredential({
      scopes: ["https://graph.microsoft.com/.default"],
    });
    return result?.accessToken ?? null;
  } catch (err) {
    logger.error("fallo al obtener token de Microsoft Graph", { err: String(err) });
    return null;
  }
}

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

export interface GraphAttendanceRecord {
  emailAddress?: string;
  totalAttendanceInSeconds?: number;
  attendanceIntervals?: { joinDateTime: string; leaveDateTime: string }[];
}

/**
 * Obtiene el reporte de asistencia más reciente de una reunión de Teams.
 * https://learn.microsoft.com/graph/api/onlinemeeting-list-attendancereports
 */
export async function fetchLatestAttendanceRecords(
  organizerUpn: string,
  meetingId: string,
  token: string,
): Promise<GraphAttendanceRecord[]> {
  const reportsRes = await fetch(
    `${GRAPH_BASE}/users/${encodeURIComponent(organizerUpn)}/onlineMeetings/${encodeURIComponent(meetingId)}/attendanceReports`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!reportsRes.ok) {
    throw new Error(`Graph attendanceReports ${reportsRes.status}: ${await reportsRes.text()}`);
  }
  const reports = (await reportsRes.json()) as { value?: { id: string }[] };
  const latestReportId = reports.value?.at(-1)?.id;
  if (!latestReportId) return [];

  const recordsRes = await fetch(
    `${GRAPH_BASE}/users/${encodeURIComponent(organizerUpn)}/onlineMeetings/${encodeURIComponent(meetingId)}/attendanceReports/${latestReportId}/attendanceRecords`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!recordsRes.ok) {
    throw new Error(`Graph attendanceRecords ${recordsRes.status}: ${await recordsRes.text()}`);
  }
  const records = (await recordsRes.json()) as { value?: GraphAttendanceRecord[] };
  return records.value ?? [];
}

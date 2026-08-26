import { io, type Socket } from "socket.io-client";
import { API_URL } from "./api-client";
import { getClientAccessToken } from "./auth";

/**
 * Socket compartido para el namespace de soporte — "chat en vivo de
 * soporte" (Fase 2). El ticket asíncrono ya existía (SupportTicket vía
 * REST); esto solo agrega el push en tiempo real (ver
 * apps/api/src/modules/support/support.gateway.ts). Un único socket por
 * pestaña (no uno por componente) para no abrir conexiones de más si el
 * admin navega entre varios tickets.
 */
let socket: Socket | null = null;

export function getSupportSocket(): Socket | null {
  const token = getClientAccessToken();
  if (!token) return null;
  if (socket?.connected && (socket.auth as { token?: string })?.token === token) return socket;
  socket?.disconnect();
  socket = io(`${API_URL}/support`, {
    auth: { token },
    transports: ["websocket"],
    reconnection: true,
  });
  return socket;
}

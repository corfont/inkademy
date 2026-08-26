import { forwardRef, Inject, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import type { AccessTokenPayload } from "../auth/auth.service";
import { SupportService } from "./support.service";

interface AuthedSocket extends Socket {
  data: { userId?: string; isGlobalStaff?: boolean };
}

/**
 * "Chat en vivo de soporte" (Fase 2) — el ticket asíncrono ya existía
 * (SupportTicket/SupportMessage, ver TicketThread.tsx), pero el alumno y
 * soporte solo se enteraban de una respuesta nueva al refrescar la
 * página. Este gateway agrega la mitad "en vivo": push por WebSocket de
 * cada mensaje nuevo a quien tenga el ticket abierto en pantalla, sin
 * reemplazar el modelo de datos ni el REST existente (SupportController
 * sigue siendo la única forma de CREAR un mensaje — el gateway solo
 * empuja, nunca escribe).
 *
 * Autenticación: los sockets no pasan por JwtAuthGuard (eso es HTTP) — se
 * verifica el token a mano en el handshake (`auth.token`, mismo access
 * token que ya usa el cliente para las llamadas REST).
 */
@WebSocketGateway({
  namespace: "/support",
  // Mismo origen permitido que el resto de la API (app.enableCors en
  // main.ts) — `origin: true` reflejaría CUALQUIER origen que se conecte,
  // demasiado permisivo para un socket autenticado. Los decoradores se
  // evalúan una sola vez al cargar el módulo, así que se lee la env var
  // directo (no hay ConfigService disponible en este punto).
  cors: { origin: process.env.APP_URL ?? "http://localhost:3000", credentials: true },
})
export class SupportGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(SupportGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => SupportService)) private readonly supportService: SupportService,
  ) {}

  async handleConnection(client: AuthedSocket) {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      if (!token) throw new Error("Falta el token de autenticación");
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get<string>("JWT_ACCESS_SECRET"),
      });
      if (payload.typ !== "access") throw new Error("Token inválido");
      client.data.userId = payload.sub;
      client.data.isGlobalStaff = payload.globalRole === "ADMIN" || payload.globalRole === "SUPPORT";
    } catch (err) {
      this.logger.warn(`Conexión de socket rechazada: ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect() {
    // Nada que limpiar — las rooms de socket.io se vacían solas al desconectar.
  }

  /**
   * Un socket se une a la room de UN ticket puntual solo si de verdad tiene
   * acceso a él — reutiliza exactamente la misma verificación que ya usa
   * el REST (SupportService.getTicket lanza ForbiddenException/NotFoundException
   * si no corresponde), para no mantener dos veces la misma regla de acceso.
   */
  @SubscribeMessage("ticket:join")
  async onJoinTicket(@ConnectedSocket() client: AuthedSocket, @MessageBody() data: { ticketId: string }) {
    if (!client.data.userId) return { ok: false, error: "No autenticado" };
    try {
      await this.supportService.getTicket(client.data.userId, data.ticketId, Boolean(client.data.isGlobalStaff));
      await client.join(`ticket:${data.ticketId}`);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "No se pudo unir al ticket" };
    }
  }

  @SubscribeMessage("ticket:leave")
  async onLeaveTicket(@ConnectedSocket() client: AuthedSocket, @MessageBody() data: { ticketId: string }) {
    await client.leave(`ticket:${data.ticketId}`);
  }

  /** Llamado por SupportService.addMessage tras crear el mensaje — nunca al revés. */
  emitNewMessage(ticketId: string, message: unknown) {
    this.server?.to(`ticket:${ticketId}`).emit("message:new", { ticketId, message });
  }

  /** Indicador de "escribiendo…" — puramente efímero, no se persiste en ningún lado. */
  @SubscribeMessage("ticket:typing")
  onTyping(@ConnectedSocket() client: AuthedSocket, @MessageBody() data: { ticketId: string }) {
    client.to(`ticket:${data.ticketId}`).emit("ticket:typing", { userId: client.data.userId });
  }
}

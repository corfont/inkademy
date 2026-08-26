import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { randomUUID } from "crypto";
import type { PrismaClient, User } from "@inkademy/db";
import type { AuthUser, RegisterInput } from "@inkademy/shared";
import { PRISMA } from "../../common/prisma/prisma.module";
import { toAuthUser } from "../../common/utils/map-user";
import { NotificationService } from "../notification/notification.service";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  globalRole: string;
  typ: "access";
  // "Contrastar el session_uuid del token con el de la base de datos; si no
  // coinciden, destruir la sesión actual" — ver JwtStrategy.validate.
  // Ausente = token emitido antes de este cambio, no se exige el chequeo.
  sid?: string;
}

interface OAuthProfile {
  provider: "GOOGLE" | "MICROSOFT";
  providerAccountId: string;
  email: string;
  firstName: string;
  lastName: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationService,
  ) {}

  toAuthUser(user: User): AuthUser {
    return toAuthUser(user);
  }

  /**
   * "Al iniciar sesión exitosamente, generar un session_uuid único y
   * guardarlo en el registro del usuario" — se llama en cada evento que
   * arranca una sesión nueva de verdad (registro, login, callback OAuth) y
   * también al cambiar la contraseña (buena práctica: forzar el
   * cierre de sesión en cualquier otro dispositivo). Un simple refresh de
   * token NO pasa por acá — reutiliza el sid vigente, ver refresh().
   */
  private async startNewSession(user: User): Promise<User> {
    return this.prisma.user.update({ where: { id: user.id }, data: { currentSessionId: randomUUID() } });
  }

  async register(input: RegisterInput) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException("Ya existe una cuenta con ese correo");

    const passwordHash = await argon2.hash(input.password);
    let user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        locale: input.locale ?? "es",
        marketingConsentEmail: input.marketingConsentEmail ?? false,
      },
    });
    user = await this.startNewSession(user);

    const verifyToken = this.signPurposeToken(user.id, "verify_email", "1d");
    await this.notifications.sendWelcome(user.email, user.firstName, user.id);
    await this.notifications.sendVerifyEmail(user.email, verifyToken, user.id);

    const accessToken = this.signAccessToken(user);
    return { user: this.toAuthUser(user), accessToken, rawUser: user };
  }

  async validateLocalUser(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException("Credenciales inválidas");
    }
    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) throw new UnauthorizedException("Credenciales inválidas");
    if (user.status !== "active") throw new UnauthorizedException("Cuenta deshabilitada");
    return user;
  }

  /** Entrypoint único para "arrancar sesión" — lo usan tanto /auth/login como el callback OAuth. */
  async login(user: User) {
    const updated = await this.startNewSession(user);
    return { user: this.toAuthUser(updated), accessToken: this.signAccessToken(updated), rawUser: updated };
  }

  signAccessToken(user: User): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      globalRole: user.globalRole,
      typ: "access",
      sid: user.currentSessionId ?? undefined,
    };
    return this.jwt.sign(payload, {
      secret: this.config.get<string>("JWT_ACCESS_SECRET"),
      expiresIn: this.config.get<string>("JWT_ACCESS_TTL", "15m"),
    });
  }

  signRefreshToken(user: User): string {
    return this.jwt.sign(
      { sub: user.id, typ: "refresh", jti: randomUUID(), sid: user.currentSessionId ?? undefined },
      {
        secret: this.config.get<string>("JWT_REFRESH_SECRET"),
        expiresIn: this.config.get<string>("JWT_REFRESH_TTL", "30d"),
      },
    );
  }

  async refresh(refreshToken: string | undefined) {
    if (!refreshToken) throw new UnauthorizedException("Falta refresh token");
    try {
      const payload = this.jwt.verify<{ sub: string; typ: string; sid?: string }>(refreshToken, {
        secret: this.config.get<string>("JWT_REFRESH_SECRET"),
      });
      if (payload.typ !== "refresh") throw new Error("token type inválido");
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.status !== "active") throw new Error("usuario inválido");
      // "Contrastar el session_uuid del token con el de la base de datos" —
      // un refresh NO arranca sesión nueva (no llama startNewSession), solo
      // reutiliza la vigente; si no coincide, alguien inició sesión después
      // en otro dispositivo y esta sesión debe morir acá.
      if (payload.sid && user.currentSessionId && payload.sid !== user.currentSessionId) {
        throw new Error("sesión cerrada por inicio de sesión en otro dispositivo");
      }
      return { accessToken: this.signAccessToken(user), user };
    } catch {
      throw new UnauthorizedException("Refresh token inválido o expirado");
    }
  }

  /** Tokens con propósito específico (reset de password / verificación de email), stateless. */
  private signPurposeToken(userId: string, purpose: string, ttl: string): string {
    return this.jwt.sign(
      { sub: userId, purpose },
      { secret: this.config.get<string>("JWT_ACCESS_SECRET"), expiresIn: ttl },
    );
  }

  private verifyPurposeToken(token: string, purpose: string): { sub: string } {
    try {
      const payload = this.jwt.verify<{ sub: string; purpose: string }>(token, {
        secret: this.config.get<string>("JWT_ACCESS_SECRET"),
      });
      if (payload.purpose !== purpose) throw new Error("purpose mismatch");
      return payload;
    } catch {
      throw new BadRequestException("Token inválido o expirado");
    }
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Nunca revelamos si el correo existe (evita enumeración de usuarios).
    if (user) {
      const token = this.signPurposeToken(user.id, "reset_password", "1h");
      await this.notifications.sendForgotPassword(user.email, token, user.id);
    }
    return;
  }

  /**
   * "Un usuario podría tenerlo abierto en más de un dispositivo" — cambiar
   * la contraseña (por cualquiera de los tres caminos: este, changePassword,
   * o AdminService.resetUserPassword) rota currentSessionId, así que
   * cualquier sesión abierta en OTRO dispositivo con la contraseña vieja
   * queda cerrada en su próxima request (ver JwtStrategy/AuthService.refresh).
   * Acá el que llama no está autenticado (vino de un link de correo), así
   * que no hay "este mismo dispositivo" que mantener con sesión iniciada —
   * simplemente rota y listo, el flujo normal lo manda a /login después.
   */
  async resetPassword(token: string, password: string) {
    const { sub } = this.verifyPurposeToken(token, "reset_password");
    const passwordHash = await argon2.hash(password);
    const user = await this.prisma.user.update({ where: { id: sub }, data: { passwordHash } });
    await this.startNewSession(user);
  }

  /**
   * Cambiar la contraseña estando ya autenticado (p.ej. justo después de
   * entrar con la contraseña temporal que generó el admin al crear la
   * cuenta) — antes solo existía el flujo de "olvidé mi contraseña" por
   * correo, sin ninguna forma de cambiarla ya adentro de la sesión.
   *
   * "Un usuario podría tenerlo abierto en más de un dispositivo" — al
   * cambiarla acá también se rota currentSessionId (cierra cualquier OTRA
   * sesión abierta con la contraseña vieja), pero a diferencia de
   * resetPassword, quien llama SÍ está autenticado en este mismo
   * dispositivo — se le devuelve el usuario actualizado para que el
   * controller le emita tokens frescos y no quede desconectado a mitad de
   * su propia acción.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) {
      throw new BadRequestException("Esta cuenta no tiene contraseña propia (inició sesión con Google/Microsoft)");
    }
    const valid = await argon2.verify(user.passwordHash, currentPassword);
    if (!valid) throw new UnauthorizedException("La contraseña actual no es correcta");

    const passwordHash = await argon2.hash(newPassword);
    const updated = await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return this.startNewSession(updated);
  }

  async verifyEmail(token: string) {
    const { sub } = this.verifyPurposeToken(token, "verify_email");
    await this.prisma.user.update({ where: { id: sub }, data: { emailVerifiedAt: new Date() } });
  }

  async findOrCreateFromOAuth(profile: OAuthProfile) {
    const oauthAccount = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
        },
      },
      include: { user: true },
    });
    if (oauthAccount) return oauthAccount.user;

    let user = await this.prisma.user.findUnique({ where: { email: profile.email } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: profile.email,
          firstName: profile.firstName || "Usuario",
          lastName: profile.lastName || "Inkademy",
          emailVerifiedAt: new Date(),
        },
      });
    }
    await this.prisma.oAuthAccount.create({
      data: {
        userId: user.id,
        provider: profile.provider,
        providerAccountId: profile.providerAccountId,
      },
    });
    return user;
  }
}

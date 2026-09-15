import {
  BadRequestException,
  ConflictException,
  HttpException,
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

/** Payload que firma el CRM (con CRM_BRIDGE_SECRET) para el puente de acceso — ver findOrCreateCrmBridgeAdmin. */
interface CrmBridgeTokenPayload {
  email: string;
  firstName?: string;
  lastName?: string;
  aud: "inkademy-crm-bridge";
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

  // Bloqueo temporal tras intentos fallidos — mismo umbral que el CRM del
  // portafolio (ver ../../CLAUDE.md, "Estandarización: Seguridad").
  private static readonly MAX_FAILED_ATTEMPTS = 5;
  private static readonly LOCKOUT_DURATION_MINUTES = 30;

  async validateLocalUser(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException("Credenciales inválidas");
    }

    // El bloqueo SÍ es un mensaje distinto y explícito (a diferencia de
    // "credenciales inválidas") — una cuenta bloqueada ya reveló que existe
    // en el intento que la bloqueó, así que ocultarlo aquí no protege nada
    // y solo confunde a quien de verdad es el dueño de la cuenta.
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutos = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000));
      throw new HttpException(
        `Cuenta bloqueada temporalmente por demasiados intentos fallidos. Intenta de nuevo en ${minutos} minuto(s), o usa "Olvidé mi contraseña".`,
        423, // Locked — HttpStatus no lo define en esta versión de NestJS
      );
    }

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) {
      await this.registerFailedLoginAttempt(user);
      throw new UnauthorizedException("Credenciales inválidas");
    }

    if (user.failedLoginAttempts > 0) {
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
    }

    if (user.status !== "active") throw new UnauthorizedException("Cuenta deshabilitada");
    return user;
  }

  /** Tras una contraseña INCORRECTA: incrementa el contador y, al llegar a
   * MAX_FAILED_ATTEMPTS, bloquea la cuenta y avisa por correo. */
  private async registerFailedLoginAttempt(user: User): Promise<void> {
    const attempts = user.failedLoginAttempts + 1;

    if (attempts >= AuthService.MAX_FAILED_ATTEMPTS) {
      const lockedUntil = new Date(Date.now() + AuthService.LOCKOUT_DURATION_MINUTES * 60_000);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: attempts, lockedUntil },
      });
      try {
        await this.notifications.sendAccountLocked(user.email, user.firstName, lockedUntil, user.id);
      } catch (err) {
        // El envío nunca debe tumbar el flujo de login.
        // eslint-disable-next-line no-console
        console.error("[account-lockout] No se pudo encolar el correo de alerta:", err);
      }
      return;
    }

    await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: attempts } });
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

  // Código de intercambio de un solo uso para el redirect de OAuth (ver
  // REVIEW.md #2.2) — en memoria del propio proceso: alcanza para el
  // volumen real de logins OAuth de esta app (un solo proceso de apps/api,
  // no horizontalmente escalado hoy) y evita depender de Redis/una tabla
  // nueva para algo que vive ~60 segundos.
  private readonly oauthExchangeCodes = new Map<string, { accessToken: string; expiresAt: number }>();
  private readonly OAUTH_EXCHANGE_TTL_MS = 60_000;

  createOAuthExchangeCode(accessToken: string): string {
    this.pruneExpiredOAuthExchangeCodes();
    const code = randomUUID();
    this.oauthExchangeCodes.set(code, { accessToken, expiresAt: Date.now() + this.OAUTH_EXCHANGE_TTL_MS });
    return code;
  }

  /** Un solo uso: se borra al leerlo, exista o no, haya expirado o no. */
  consumeOAuthExchangeCode(code: string): string | null {
    const entry = this.oauthExchangeCodes.get(code);
    this.oauthExchangeCodes.delete(code);
    if (!entry || entry.expiresAt < Date.now()) return null;
    return entry.accessToken;
  }

  private pruneExpiredOAuthExchangeCodes() {
    const now = Date.now();
    for (const [code, entry] of this.oauthExchangeCodes) {
      if (entry.expiresAt < now) this.oauthExchangeCodes.delete(code);
    }
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

  /**
   * Puente de acceso desde el CRM de Inkapitales (modo "módulo del CRM",
   * uso interno — ver CLAUDE.md de portafolio, sección "Dos categorías de
   * sistema"). El CRM firma el token con el mismo CRM_BRIDGE_SECRET; acá
   * solo se verifica — Inkademy nunca ve ni necesita la sesión del CRM en
   * sí, solo confía en esta aserción firmada de "este correo es un admin
   * autenticado del CRM ahora mismo".
   */
  verifyCrmBridgeToken(token: string): CrmBridgeTokenPayload {
    const secret = this.config.get<string>("CRM_BRIDGE_SECRET");
    if (!secret) throw new BadRequestException("El puente de acceso con el CRM no está configurado en este servidor.");
    try {
      const payload = this.jwt.verify<CrmBridgeTokenPayload>(token, { secret });
      if (payload.aud !== "inkademy-crm-bridge" || !payload.email) throw new Error("payload inválido");
      return payload;
    } catch {
      throw new UnauthorizedException("El enlace de acceso desde el CRM ya expiró o no es válido — vuelve a intentarlo desde el CRM.");
    }
  }

  /**
   * "El admin del CRM tendrá todos los roles de Inkademy" (pedido
   * explícito del usuario) — se busca por correo; si no existe, se crea
   * como ADMIN directo; si ya existe con otro rol principal (ej. ya es
   * TEACHER en Inkademy por su cuenta), se le AGREGA ADMIN como rol
   * secundario en vez de pisar su rol principal — conserva lo que ya tenía
   * y de todas formas le da acceso admin completo (los guards de la API
   * validan globalRole+secondaryRoles juntos, mismo patrón que el resto
   * del sistema multi-rol).
   */
  async findOrCreateCrmBridgeAdmin(profile: { email: string; firstName?: string; lastName?: string }): Promise<User> {
    let user = await this.prisma.user.findUnique({ where: { email: profile.email } });
    if (!user) {
      return this.prisma.user.create({
        data: {
          email: profile.email,
          firstName: profile.firstName || "Admin",
          lastName: profile.lastName || "CRM",
          globalRole: "ADMIN",
          emailVerifiedAt: new Date(),
        },
      });
    }
    if (user.globalRole !== "ADMIN" && !user.secondaryRoles.includes("ADMIN")) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { secondaryRoles: { push: "ADMIN" } },
      });
    }
    return user;
  }
}

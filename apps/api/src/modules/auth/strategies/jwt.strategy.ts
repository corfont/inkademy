import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { PrismaClient } from "@inkademy/db";
import { PRISMA } from "../../../common/prisma/prisma.module";
import type { AccessTokenPayload } from "../auth.service";
import type { RequestUser } from "../../../common/guards/jwt-auth.guard";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(
    config: ConfigService,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_ACCESS_SECRET"),
    });
  }

  async validate(payload: AccessTokenPayload): Promise<RequestUser> {
    if (payload.typ !== "access") throw new UnauthorizedException("Token inválido");
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== "active") throw new UnauthorizedException("Usuario inválido");
    // "Contrastar el session_uuid del token con el de la base de datos; si
    // no coinciden, destruir la sesión actual" — payload.sid ausente o
    // currentSessionId null = token/cuenta de antes de este cambio, no se
    // exige (evita invalidar de golpe todas las sesiones ya abiertas al
    // desplegar esto).
    if (payload.sid && user.currentSessionId && payload.sid !== user.currentSessionId) {
      throw new UnauthorizedException("Tu sesión se cerró porque iniciaste sesión en otro dispositivo");
    }
    // Se recalcula en cada request (no se guarda en el JWT) para que un
    // cambio de rol hecho por un admin tenga efecto inmediato, sin esperar
    // a que el usuario vuelva a iniciar sesión.
    const roles = Array.from(new Set([user.globalRole, ...user.secondaryRoles]));
    return { id: user.id, email: user.email, globalRole: user.globalRole, roles };
  }
}

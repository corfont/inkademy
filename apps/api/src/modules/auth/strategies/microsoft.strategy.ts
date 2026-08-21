import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
// `passport-oauth2` exporta la clase Strategy como `export =` (CommonJS);
// se importa así para que funcione sin depender de esModuleInterop/named exports.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const OAuth2Strategy = require("passport-oauth2");

/**
 * Estrategia OAuth2 genérica para Microsoft / Azure AD (login "Microsoft").
 * Usa el mismo tenant (MS_TENANT_ID/MS_CLIENT_ID/MS_CLIENT_SECRET) que el
 * adapter de Teams (live-session), pero con el flujo delegado (login de
 * usuario) en vez de client-credentials.
 */
@Injectable()
export class MicrosoftStrategy extends PassportStrategy(OAuth2Strategy, "microsoft") {
  private readonly logger = new Logger(MicrosoftStrategy.name);

  constructor(config: ConfigService) {
    const tenant = config.get<string>("MS_TENANT_ID") || "common";
    super({
      authorizationURL: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
      tokenURL: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      clientID: config.get<string>("MS_CLIENT_ID") || "not-configured",
      clientSecret: config.get<string>("MS_CLIENT_SECRET") || "not-configured",
      callbackURL: config.get<string>("MS_CALLBACK_URL"),
      scope: ["openid", "profile", "email", "User.Read"],
    });
  }

  /** passport-oauth2 no sabe cómo obtener el perfil de Microsoft Graph: lo pedimos manualmente. */
  async userProfile(accessToken: string, done: (err: unknown, profile?: unknown) => void) {
    try {
      const res = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Graph /me respondió ${res.status}`);
      const profile = await res.json();
      done(null, profile);
    } catch (err) {
      this.logger.error("Error obteniendo perfil de Microsoft Graph", err as Error);
      done(err);
    }
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: {
      id: string;
      mail?: string;
      userPrincipalName?: string;
      givenName?: string;
      surname?: string;
      displayName?: string;
    },
    done: (err: unknown, user?: unknown) => void,
  ) {
    const email = profile.mail ?? profile.userPrincipalName;
    done(null, {
      provider: "MICROSOFT" as const,
      providerAccountId: profile.id,
      email,
      firstName: profile.givenName ?? profile.displayName ?? "Usuario",
      lastName: profile.surname ?? "",
    });
  }
}

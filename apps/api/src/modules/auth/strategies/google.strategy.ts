import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Profile, Strategy, VerifyCallback } from "passport-google-oauth20";

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>("GOOGLE_CLIENT_ID") || "not-configured",
      clientSecret: config.get<string>("GOOGLE_CLIENT_SECRET") || "not-configured",
      callbackURL: config.get<string>("GOOGLE_CALLBACK_URL"),
      scope: ["email", "profile"],
    });
  }

  validate(_accessToken: string, _refreshToken: string, profile: Profile, done: VerifyCallback) {
    const email = profile.emails?.[0]?.value;
    done(null, {
      provider: "GOOGLE" as const,
      providerAccountId: profile.id,
      email,
      firstName: profile.name?.givenName ?? profile.displayName ?? "Usuario",
      lastName: profile.name?.familyName ?? "",
    });
  }
}

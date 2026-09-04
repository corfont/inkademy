import { randomBytes } from "crypto";
import { ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request, Response } from "express";

// Mismo hallazgo/fix que google-auth.guard.ts (REVIEW.md #2.1) — ver el
// comentario ahí para el razonamiento completo.
export const MICROSOFT_OAUTH_STATE_COOKIE = "oauth_state_microsoft";
const STATE_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;

@Injectable()
export class MicrosoftAuthGuard extends AuthGuard("microsoft") {
  getAuthenticateOptions(context: ExecutionContext) {
    const res = context.switchToHttp().getResponse<Response>();
    const nonce = randomBytes(16).toString("hex");
    res.cookie(MICROSOFT_OAUTH_STATE_COOKIE, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/auth",
      maxAge: STATE_COOKIE_MAX_AGE_MS,
    });
    return { state: nonce };
  }
}

/** Usado SOLO en la ruta de callback. */
@Injectable()
export class MicrosoftCallbackAuthGuard extends AuthGuard("microsoft") {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const expected = req.cookies?.[MICROSOFT_OAUTH_STATE_COOKIE];
    const received = req.query?.state;
    res.clearCookie(MICROSOFT_OAUTH_STATE_COOKIE, { path: "/auth" });
    if (!expected || !received || expected !== received) {
      throw new UnauthorizedException("Flujo de inicio de sesión con Microsoft inválido o expirado — intenta de nuevo.");
    }
    return super.canActivate(context);
  }
}

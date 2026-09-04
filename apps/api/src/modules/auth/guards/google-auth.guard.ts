import { randomBytes } from "crypto";
import { ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request, Response } from "express";

// Hallazgo de auditoría (REVIEW.md #2.1): ninguna estrategia OAuth pasaba
// `state`, y no hay session store (no hay express-session en todo el repo)
// para el modo `state:true` de passport-oauth2 — sin esto, el callback
// acepta cualquier `code` válido sin verificar que venga del MISMO
// navegador que inició el flujo (login CSRF: un atacante puede iniciar su
// propio flujo, capturar la URL de callback con su código, y hacer que la
// VÍCTIMA la visite — el navegador de la víctima queda autenticado como el
// atacante). Se implementa double-submit-cookie sin sesión de servidor:
// un nonce aleatorio va en una cookie httpOnly (path "/auth", 10 min) Y
// como el parámetro `state` de la URL de autorización; el guard del
// callback (GoogleCallbackAuthGuard) exige que ambos coincidan antes de
// dejar seguir a Passport.
export const GOOGLE_OAUTH_STATE_COOKIE = "oauth_state_google";
const STATE_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;

@Injectable()
export class GoogleAuthGuard extends AuthGuard("google") {
  getAuthenticateOptions(context: ExecutionContext) {
    const res = context.switchToHttp().getResponse<Response>();
    const nonce = randomBytes(16).toString("hex");
    res.cookie(GOOGLE_OAUTH_STATE_COOKIE, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/auth",
      maxAge: STATE_COOKIE_MAX_AGE_MS,
    });
    return { state: nonce };
  }
}

/** Usado SOLO en la ruta de callback — ver el comentario de arriba. */
@Injectable()
export class GoogleCallbackAuthGuard extends AuthGuard("google") {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const expected = req.cookies?.[GOOGLE_OAUTH_STATE_COOKIE];
    const received = req.query?.state;
    res.clearCookie(GOOGLE_OAUTH_STATE_COOKIE, { path: "/auth" });
    if (!expected || !received || expected !== received) {
      throw new UnauthorizedException("Flujo de inicio de sesión con Google inválido o expirado — intenta de nuevo.");
    }
    return super.canActivate(context);
  }
}

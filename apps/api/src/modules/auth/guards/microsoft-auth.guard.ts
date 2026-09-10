import { randomBytes } from "crypto";
import { ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request, Response } from "express";

// Mismo hallazgo/fix que google-auth.guard.ts (REVIEW.md #2.1) — ver el
// comentario ahí para el razonamiento completo.
export const MICROSOFT_OAUTH_STATE_COOKIE = "oauth_state_microsoft";
const STATE_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;

// Formato laxo a propósito (no exige TLD conocido, no es lo que valida que
// el correo exista) — solo evita que un valor con basura o un intento de
// meter algo que no sea un correo llegue como login_hint a Microsoft. Un
// login_hint inválido simplemente se ignora (undefined), nunca rompe el
// flujo de login.
const LOGIN_HINT_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class MicrosoftAuthGuard extends AuthGuard("microsoft") {
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const nonce = randomBytes(16).toString("hex");
    res.cookie(MICROSOFT_OAUTH_STATE_COOKIE, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/auth",
      maxAge: STATE_COOKIE_MAX_AGE_MS,
    });
    // "El sistema sabe que es de Microsoft e inicia sesión" — el login del
    // frontend detecta el dominio y redirige acá con ?login_hint=<correo>
    // para que Microsoft precargue el campo de correo en su propia pantalla
    // (el usuario nunca lo vuelve a tipear). MicrosoftStrategy.authorizationParams
    // es quien realmente lo agrega a la URL de autorización — ver ese archivo.
    const rawHint = req.query?.login_hint;
    const loginHint = typeof rawHint === "string" && LOGIN_HINT_PATTERN.test(rawHint) ? rawHint : undefined;
    return { state: nonce, login_hint: loginHint };
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

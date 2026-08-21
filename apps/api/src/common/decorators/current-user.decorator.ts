import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { RequestUser } from "../guards/jwt-auth.guard";

/**
 * Extrae el usuario autenticado adjuntado por JwtAuthGuard/JwtStrategy.
 * Uso: `findMine(@CurrentUser() user: RequestUser)`.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof RequestUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: RequestUser | undefined = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { ConfigService } from "@nestjs/config";
import { registerSchema } from "@inkademy/shared";
import { forgotPasswordSchema, resetPasswordSchema } from "../../common/validation/local-schemas";
import type { RegisterInput } from "@inkademy/shared";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { Public } from "../../common/decorators/public.decorator";
import type { RequestUser } from "../../common/guards/jwt-auth.guard";
import { AuthService } from "./auth.service";
import { LocalAuthGuard } from "./guards/local-auth.guard";
import { GoogleAuthGuard } from "./guards/google-auth.guard";
import { MicrosoftAuthGuard } from "./guards/microsoft-auth.guard";
import { AuthResponseDto, ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from "./dto/auth.dto";
import type { PrismaClient } from "@inkademy/db";
import { PRISMA } from "../../common/prisma/prisma.module";

const REFRESH_COOKIE = "refresh_token";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  private setRefreshCookie(res: Response, token: string) {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.config.get("NODE_ENV") === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }

  @Public()
  @Post("register")
  @ApiOperation({ summary: "Crea una cuenta de estudiante" })
  @ApiBody({ type: RegisterDto })
  @ApiOkResponse({ type: AuthResponseDto })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, accessToken } = await this.authService.register(dto);
    const fullUser = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    this.setRefreshCookie(res, this.authService.signRefreshToken(fullUser));
    return { user, accessToken };
  }

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post("login")
  @ApiOperation({ summary: "Inicia sesión con email + password" })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: AuthResponseDto })
  async login(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = req.user as any;
    const result = this.authService.login(user);
    this.setRefreshCookie(res, this.authService.signRefreshToken(user));
    return result;
  }

  @Public()
  @Post("refresh")
  @ApiOperation({ summary: "Renueva el accessToken usando la cookie de refresh" })
  async refresh(@Req() req: Request & { cookies?: Record<string, string> }, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE];
    const { accessToken, user } = await this.authService.refresh(token);
    this.setRefreshCookie(res, this.authService.signRefreshToken(user));
    return { accessToken };
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Cierra sesión (limpia la cookie de refresh)" })
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(REFRESH_COOKIE, { path: "/" });
  }

  @ApiBearerAuth()
  @Get("me")
  @ApiOperation({ summary: "Perfil del usuario autenticado" })
  async me(@CurrentUser() user: RequestUser) {
    const fullUser = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    return this.authService.toAuthUser(fullUser);
  }

  @Public()
  @Post("forgot-password")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBody({ type: ForgotPasswordDto })
  @ApiOperation({ summary: "Solicita email de recuperación de contraseña" })
  async forgotPassword(@Body() body: { email: string }) {
    await this.authService.forgotPassword(body.email);
  }

  @Public()
  @Post("reset-password")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBody({ type: ResetPasswordDto })
  @ApiOperation({ summary: "Restablece la contraseña con el token recibido por email" })
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: { token: string; password: string },
  ) {
    await this.authService.resetPassword(body.token, body.password);
  }

  @Public()
  @Get("verify-email")
  @ApiOperation({ summary: "Confirma el correo a partir del token enviado por email" })
  async verifyEmail(@Req() req: Request) {
    const token = req.query.token as string;
    await this.authService.verifyEmail(token);
    return { verified: true };
  }

  // --- OAuth Google ---
  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get("google")
  @ApiOperation({ summary: "Inicia el flujo OAuth con Google" })
  googleLogin() {
    // El guard redirige a Google; este handler nunca se ejecuta.
  }

  @Public()
  @UseGuards(GoogleAuthGuard)
  @Get("google/callback")
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    return this.handleOAuthCallback(req, res);
  }

  // --- OAuth Microsoft / Azure AD (mismo tenant que Teams) ---
  @Public()
  @UseGuards(MicrosoftAuthGuard)
  @Get("microsoft")
  @ApiOperation({ summary: "Inicia el flujo OAuth con Microsoft / Azure AD" })
  microsoftLogin() {}

  @Public()
  @UseGuards(MicrosoftAuthGuard)
  @Get("microsoft/callback")
  async microsoftCallback(@Req() req: Request, @Res() res: Response) {
    return this.handleOAuthCallback(req, res);
  }

  private async handleOAuthCallback(req: Request, res: Response) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = req.user as any;
    const user = await this.authService.findOrCreateFromOAuth(profile);
    const accessToken = this.authService.signAccessToken(user);
    this.setRefreshCookie(res, this.authService.signRefreshToken(user));
    const appUrl = this.config.get<string>("APP_URL", "http://localhost:3000");
    return res.redirect(`${appUrl}/auth/callback?token=${accessToken}`);
  }
}

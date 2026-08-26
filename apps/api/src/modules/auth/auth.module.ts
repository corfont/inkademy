import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { LocalStrategy } from "./strategies/local.strategy";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { GoogleStrategy } from "./strategies/google.strategy";
import { MicrosoftStrategy } from "./strategies/microsoft.strategy";
import { NotificationModule } from "../notification/notification.module";

@Module({
  imports: [
    PassportModule,
    NotificationModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("JWT_ACCESS_SECRET"),
        signOptions: { expiresIn: config.get<string>("JWT_ACCESS_TTL", "15m") },
      }),
    }),
    ConfigModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, LocalStrategy, JwtStrategy, GoogleStrategy, MicrosoftStrategy],
  // JwtModule también se exporta — SupportGateway (WebSockets) necesita
  // JwtService para verificar el token del handshake a mano, ya que las
  // conexiones de socket no pasan por el JwtAuthGuard normal de HTTP.
  exports: [AuthService, JwtModule],
})
export class AuthModule {}

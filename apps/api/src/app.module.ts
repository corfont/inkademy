import { join } from "node:path";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { PrismaModule } from "./common/prisma/prisma.module";
import { QueuesModule } from "./common/queues/queues.module";
import { CommonModule } from "./common/common.module";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { StripSensitiveFieldsInterceptor } from "./common/interceptors/strip-sensitive-fields.interceptor";
import { StorageModule } from "./storage/storage.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { EnrollmentModule } from "./modules/enrollment/enrollment.module";
import { CommerceModule } from "./modules/commerce/commerce.module";
import { AssessmentModule } from "./modules/assessment/assessment.module";
import { CertificateModule } from "./modules/certificate/certificate.module";
import { LiveSessionModule } from "./modules/live-session/live-session.module";
import { CalendarModule } from "./modules/calendar/calendar.module";
import { NotificationModule } from "./modules/notification/notification.module";
import { SupportModule } from "./modules/support/support.module";
import { CompaniesModule } from "./modules/companies/companies.module";
import { AdminModule } from "./modules/admin/admin.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { SuggestionsModule } from "./modules/suggestions/suggestions.module";
import { ChatbotModule } from "./modules/chatbot/chatbot.module";
import { NpsModule } from "./modules/nps/nps.module";
import { ScormModule } from "./modules/scorm/scorm.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // En Docker las variables llegan como env reales del contenedor (no hay
      // .env que leer). En desarrollo local ("pnpm --filter @inkademy/api dev"
      // o "start:prod"), el cwd es apps/api, así que además del .env local
      // buscamos el de la raíz del monorepo. @nestjs/config usa el primero
      // que exista y no sobreescribe variables ya presentes en process.env.
      envFilePath: [".env", join(__dirname, "../../../.env")],
    }),
    // "No hay límite de intentos de login, ni de forgot-password, ni de
    // registro" — hallazgo de auditoría de seguridad: sin esto, cualquiera
    // puede hacer fuerza bruta contra /auth/login, bombardear de correos de
    // "olvidé mi contraseña" a una víctima, o crear cuentas sin límite.
    // Este es el límite GLOBAL de respaldo (por IP); los endpoints de auth
    // más sensibles tienen su propio `@Throttle()` más estricto (ver
    // auth.controller.ts) — NestJS aplica el más restrictivo de los dos.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    QueuesModule,
    CommonModule,
    StorageModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    EnrollmentModule,
    CommerceModule,
    AssessmentModule,
    CertificateModule,
    LiveSessionModule,
    CalendarModule,
    NotificationModule,
    SupportModule,
    CompaniesModule,
    AdminModule,
    SettingsModule,
    SuggestionsModule,
    ChatbotModule,
    NpsModule,
    ScormModule,
  ],
  providers: [
    // Orden importa: ThrottlerGuard corre primero (limita por IP sin
    // necesitar sesión), JwtAuthGuard después (autenticación/@Public()).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    // Defensa en profundidad: nunca dejar salir `passwordHash` aunque algún
    // endpoint use `include: { user: true }` — ver el comentario del
    // interceptor para el detalle.
    { provide: APP_INTERCEPTOR, useClass: StripSensitiveFieldsInterceptor },
  ],
})
export class AppModule {}

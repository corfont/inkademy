import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { PrismaModule } from "./common/prisma/prisma.module";
import { QueuesModule } from "./common/queues/queues.module";
import { CommonModule } from "./common/common.module";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}

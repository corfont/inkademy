import { Module } from "@nestjs/common";
import { CalendarModule } from "../calendar/calendar.module";
import { CertificateModule } from "../certificate/certificate.module";
import { NotificationModule } from "../notification/notification.module";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";

@Module({
  imports: [CalendarModule, NotificationModule, CertificateModule],
  controllers: [CompaniesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}

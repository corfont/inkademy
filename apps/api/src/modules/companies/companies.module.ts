import { Module } from "@nestjs/common";
import { CalendarModule } from "../calendar/calendar.module";
import { CertificateModule } from "../certificate/certificate.module";
import { NotificationModule } from "../notification/notification.module";
import { EnrollmentModule } from "../enrollment/enrollment.module";
import { CommerceModule } from "../commerce/commerce.module";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";

@Module({
  // CommerceModule: convertQuoteToSeatPool necesita CommerceService.createElectronicInvoiceIfNeeded
  // para facturar la venta B2B al convertir una cotización aceptada — sin
  // dependencia circular (CommerceModule no importa CompaniesModule).
  imports: [CalendarModule, NotificationModule, CertificateModule, EnrollmentModule, CommerceModule],
  controllers: [CompaniesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}

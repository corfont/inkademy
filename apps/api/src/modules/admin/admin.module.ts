import { Module } from "@nestjs/common";
import { StorageModule } from "../../storage/storage.module";
import { AssessmentModule } from "../assessment/assessment.module";
import { EnrollmentModule } from "../enrollment/enrollment.module";
import { NotificationModule } from "../notification/notification.module";
import { CompaniesModule } from "../companies/companies.module";
import { ScormModule } from "../scorm/scorm.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { ReportsController } from "./reports/reports.controller";
import { ReportsService } from "./reports/reports.service";

@Module({
  // EnrollmentModule: "el administrador debe poder resetear un avance a 0%
  // o 100% en casos extremos" — reusa EnrollmentService.adminSetProgress
  // (misma lógica de recomputeProgress que ya usa el resto del sistema)
  // en vez de duplicarla acá.
  imports: [AssessmentModule, EnrollmentModule, StorageModule, NotificationModule, CompaniesModule, ScormModule],
  controllers: [AdminController, ReportsController],
  providers: [AdminService, ReportsService],
})
export class AdminModule {}

import { Module } from "@nestjs/common";
import { StorageModule } from "../../storage/storage.module";
import { AssessmentModule } from "../assessment/assessment.module";
import { NotificationModule } from "../notification/notification.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { ReportsController } from "./reports/reports.controller";
import { ReportsService } from "./reports/reports.service";

@Module({
  imports: [AssessmentModule, StorageModule, NotificationModule],
  controllers: [AdminController, ReportsController],
  providers: [AdminService, ReportsService],
})
export class AdminModule {}

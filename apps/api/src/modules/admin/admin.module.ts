import { Module } from "@nestjs/common";
import { StorageModule } from "../../storage/storage.module";
import { AssessmentModule } from "../assessment/assessment.module";
import { NotificationModule } from "../notification/notification.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [AssessmentModule, StorageModule, NotificationModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}

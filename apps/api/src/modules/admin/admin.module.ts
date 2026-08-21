import { Module } from "@nestjs/common";
import { AssessmentModule } from "../assessment/assessment.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [AssessmentModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}

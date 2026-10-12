import { Module } from "@nestjs/common";
import { NotificationModule } from "../notification/notification.module";
import { ComplaintsController } from "./complaints.controller";
import { ComplaintsService } from "./complaints.service";

@Module({
  imports: [NotificationModule],
  controllers: [ComplaintsController],
  providers: [ComplaintsService],
})
export class ComplaintsModule {}

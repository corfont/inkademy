import { Module } from "@nestjs/common";
import { NotificationModule } from "../notification/notification.module";
import { NpsAdminController, NpsPublicController } from "./nps.controller";
import { NpsService } from "./nps.service";

@Module({
  imports: [NotificationModule],
  controllers: [NpsAdminController, NpsPublicController],
  providers: [NpsService],
})
export class NpsModule {}

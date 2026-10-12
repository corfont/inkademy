import { Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module";
import { NotificationController } from "./notification.controller";
import { AdminNotificationController } from "./admin-notification.controller";
import { NotificationService } from "./notification.service";

@Module({
  imports: [SettingsModule],
  controllers: [NotificationController, AdminNotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}

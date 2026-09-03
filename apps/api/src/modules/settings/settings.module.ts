import { Module } from "@nestjs/common";
import { StorageModule } from "../../storage/storage.module";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";
import { SunatSettingsService } from "./sunat-settings.service";
import { ChatbotSettingsService } from "./chatbot-settings.service";
import { EmailServerSettingsService } from "./email-server-settings.service";
import { NotificationSettingsService } from "./notification-settings.service";

@Module({
  imports: [StorageModule],
  controllers: [SettingsController],
  providers: [SettingsService, SunatSettingsService, ChatbotSettingsService, EmailServerSettingsService, NotificationSettingsService],
  exports: [ChatbotSettingsService, EmailServerSettingsService, NotificationSettingsService],
})
export class SettingsModule {}

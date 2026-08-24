import { Module } from "@nestjs/common";
import { StorageModule } from "../../storage/storage.module";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";
import { SunatSettingsService } from "./sunat-settings.service";
import { ChatbotSettingsService } from "./chatbot-settings.service";

@Module({
  imports: [StorageModule],
  controllers: [SettingsController],
  providers: [SettingsService, SunatSettingsService, ChatbotSettingsService],
  exports: [ChatbotSettingsService],
})
export class SettingsModule {}

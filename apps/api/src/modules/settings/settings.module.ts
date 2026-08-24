import { Module } from "@nestjs/common";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";
import { SunatSettingsService } from "./sunat-settings.service";
import { ChatbotSettingsService } from "./chatbot-settings.service";

@Module({
  controllers: [SettingsController],
  providers: [SettingsService, SunatSettingsService, ChatbotSettingsService],
  exports: [ChatbotSettingsService],
})
export class SettingsModule {}

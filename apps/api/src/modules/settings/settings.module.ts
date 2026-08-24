import { Module } from "@nestjs/common";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";
import { SunatSettingsService } from "./sunat-settings.service";

@Module({
  controllers: [SettingsController],
  providers: [SettingsService, SunatSettingsService],
})
export class SettingsModule {}

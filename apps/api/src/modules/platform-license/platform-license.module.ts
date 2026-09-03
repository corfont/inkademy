import { Module } from "@nestjs/common";
import { PlatformLicenseController } from "./platform-license.controller";
import { PlatformLicenseService } from "./platform-license.service";

@Module({
  controllers: [PlatformLicenseController],
  providers: [PlatformLicenseService],
})
export class PlatformLicenseModule {}

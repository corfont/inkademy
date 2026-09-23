import { Module } from "@nestjs/common";
import { PlatformCoreController } from "./platform-core.controller";
import { PlatformCoreService } from "./platform-core.service";
import { CrmSecretGuard } from "./guards/crm-secret.guard";

@Module({
  controllers: [PlatformCoreController],
  providers: [PlatformCoreService, CrmSecretGuard],
})
export class PlatformCoreModule {}

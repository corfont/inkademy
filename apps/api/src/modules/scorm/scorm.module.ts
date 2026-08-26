import { Module } from "@nestjs/common";
import { StorageModule } from "../../storage/storage.module";
import { AuthModule } from "../auth/auth.module";
import { ScormController } from "./scorm.controller";
import { ScormService } from "./scorm.service";

@Module({
  imports: [StorageModule, AuthModule],
  controllers: [ScormController],
  providers: [ScormService],
  exports: [ScormService],
})
export class ScormModule {}

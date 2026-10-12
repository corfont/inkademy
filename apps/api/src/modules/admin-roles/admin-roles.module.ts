import { Module } from "@nestjs/common";
import { AdminAccessController, AdminRolesController } from "./admin-roles.controller";
import { AdminRolesService } from "./admin-roles.service";

@Module({
  controllers: [AdminRolesController, AdminAccessController],
  providers: [AdminRolesService],
})
export class AdminRolesModule {}

import { Module } from "@nestjs/common";
import { LiveSessionController } from "./live-session.controller";
import { LiveSessionService } from "./live-session.service";
import { TeamsProvider } from "./providers/teams.provider";

@Module({
  controllers: [LiveSessionController],
  providers: [LiveSessionService, TeamsProvider],
  exports: [LiveSessionService, TeamsProvider],
})
export class LiveSessionModule {}

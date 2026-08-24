import { Module } from "@nestjs/common";
import { CalendarModule } from "../calendar/calendar.module";
import { NotificationModule } from "../notification/notification.module";
import { LiveSessionController } from "./live-session.controller";
import { LiveSessionService } from "./live-session.service";
import { TeamsProvider } from "./providers/teams.provider";

@Module({
  imports: [CalendarModule, NotificationModule],
  controllers: [LiveSessionController],
  providers: [LiveSessionService, TeamsProvider],
  exports: [LiveSessionService, TeamsProvider],
})
export class LiveSessionModule {}

import { Module } from "@nestjs/common";
import { CalendarModule } from "../calendar/calendar.module";
import { NotificationModule } from "../notification/notification.module";
import { LiveSessionController } from "./live-session.controller";
import { LiveSessionService } from "./live-session.service";
import { TeamsProvider } from "./providers/teams.provider";
import { ZoomProvider } from "./providers/zoom.provider";

@Module({
  imports: [CalendarModule, NotificationModule],
  controllers: [LiveSessionController],
  providers: [LiveSessionService, TeamsProvider, ZoomProvider],
  exports: [LiveSessionService, TeamsProvider, ZoomProvider],
})
export class LiveSessionModule {}

import { Module } from "@nestjs/common";
import { CalendarController, CalendarIcsController } from "./calendar.controller";
import { CalendarService } from "./calendar.service";

@Module({
  controllers: [CalendarController, CalendarIcsController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}

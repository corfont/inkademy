ALTER TABLE "CalendarEvent" ADD COLUMN "courseId" TEXT;

ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

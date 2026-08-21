-- AddForeignKey
ALTER TABLE "CompanySeatPool" ADD CONSTRAINT "CompanySeatPool_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySeatPool" ADD CONSTRAINT "CompanySeatPool_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

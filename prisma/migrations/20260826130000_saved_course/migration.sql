CREATE TABLE "SavedCourse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedCourse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SavedCourse_userId_courseId_key" ON "SavedCourse"("userId", "courseId");

ALTER TABLE "SavedCourse" ADD CONSTRAINT "SavedCourse_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SavedCourse" ADD CONSTRAINT "SavedCourse_courseId_fkey"
  FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

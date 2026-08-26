-- CourseRating: calificación de 1-5 estrellas + comentario que el alumno
-- deja al terminar un curso. Una por matrícula.
CREATE TABLE "CourseRating" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourseRating_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourseRating_enrollmentId_key" ON "CourseRating"("enrollmentId");
CREATE INDEX "CourseRating_courseId_idx" ON "CourseRating"("courseId");

ALTER TABLE "CourseRating" ADD CONSTRAINT "CourseRating_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseRating" ADD CONSTRAINT "CourseRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CourseRating" ADD CONSTRAINT "CourseRating_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- NPS survey (B2B) — pregunta única configurable por admin, envíos por empresa.
CREATE TABLE "NpsSurvey" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "question" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NpsSurvey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NpsSurveyResponse" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentToEmail" TEXT NOT NULL,
    "score" INTEGER,
    "comment" TEXT,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "NpsSurveyResponse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NpsSurveyResponse_token_key" ON "NpsSurveyResponse"("token");
CREATE INDEX "NpsSurveyResponse_companyId_idx" ON "NpsSurveyResponse"("companyId");

ALTER TABLE "NpsSurveyResponse" ADD CONSTRAINT "NpsSurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "NpsSurvey"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NpsSurveyResponse" ADD CONSTRAINT "NpsSurveyResponse_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

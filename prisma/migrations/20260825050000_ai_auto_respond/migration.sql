ALTER TABLE "ChatbotSettings"
  ADD COLUMN "suggestionAutoRespond" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "suggestionAutoRespondDelayMinutes" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "CourseSuggestion"
  ADD COLUMN "respondedByAi" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "SupportMessage"
  ALTER COLUMN "authorId" DROP NOT NULL,
  ADD COLUMN "isAiGenerated" BOOLEAN NOT NULL DEFAULT false;

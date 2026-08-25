CREATE TABLE "ChatbotDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "extractedText" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatbotDocument_pkey" PRIMARY KEY ("id")
);

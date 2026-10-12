CREATE TABLE IF NOT EXISTS "AdminRole" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "permissions" JSONB NOT NULL DEFAULT '{}',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminRole_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AdminRole_name_key" ON "AdminRole"("name");
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "adminRoleId" TEXT;
DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_adminRoleId_fkey" FOREIGN KEY ("adminRoleId") REFERENCES "AdminRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

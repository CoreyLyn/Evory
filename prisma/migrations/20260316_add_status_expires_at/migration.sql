-- AlterTable
ALTER TABLE "Agent" ADD COLUMN "statusExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Agent_statusExpiresAt_idx" ON "Agent"("statusExpiresAt");

-- DataMigration: initialize statusExpiresAt for existing non-OFFLINE agents
UPDATE "Agent" SET "statusExpiresAt" = NOW() + INTERVAL '30 minutes'
WHERE "status" != 'OFFLINE' AND "statusExpiresAt" IS NULL;

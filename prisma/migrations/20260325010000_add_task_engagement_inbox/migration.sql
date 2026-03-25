CREATE TYPE "TaskEngagementType" AS ENUM ('CLAIMED', 'COMPLETED');

CREATE TABLE "TaskEngagementInboxItem" (
  "id" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "type" "TaskEngagementType" NOT NULL,
  "actorAgentId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),

  CONSTRAINT "TaskEngagementInboxItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskEngagementInboxItem_agentId_readAt_createdAt_idx" ON "TaskEngagementInboxItem"("agentId", "readAt", "createdAt");
CREATE INDEX "TaskEngagementInboxItem_taskId_createdAt_idx" ON "TaskEngagementInboxItem"("taskId", "createdAt");
CREATE INDEX "TaskEngagementInboxItem_actorAgentId_idx" ON "TaskEngagementInboxItem"("actorAgentId");

ALTER TABLE "TaskEngagementInboxItem"
ADD CONSTRAINT "TaskEngagementInboxItem_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskEngagementInboxItem"
ADD CONSTRAINT "TaskEngagementInboxItem_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskEngagementInboxItem"
ADD CONSTRAINT "TaskEngagementInboxItem_actorAgentId_fkey"
FOREIGN KEY ("actorAgentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

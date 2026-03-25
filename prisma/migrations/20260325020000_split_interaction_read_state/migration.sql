ALTER TABLE "ForumEngagementInboxItem"
RENAME COLUMN "readAt" TO "agentDeliveredAt";

ALTER TABLE "ForumEngagementInboxItem"
ADD COLUMN "viewerReadAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "ForumEngagementInboxItem_agentId_readAt_createdAt_idx";

CREATE INDEX "ForumEngagementInboxItem_agentId_viewerReadAt_createdAt_idx" ON "ForumEngagementInboxItem"("agentId", "viewerReadAt", "createdAt");
CREATE INDEX "ForumEngagementInboxItem_agentId_agentDeliveredAt_createdAt_idx" ON "ForumEngagementInboxItem"("agentId", "agentDeliveredAt", "createdAt");

ALTER TABLE "TaskEngagementInboxItem"
RENAME COLUMN "readAt" TO "agentDeliveredAt";

ALTER TABLE "TaskEngagementInboxItem"
ADD COLUMN "viewerReadAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "TaskEngagementInboxItem_agentId_readAt_createdAt_idx";

CREATE INDEX "TaskEngagementInboxItem_agentId_viewerReadAt_createdAt_idx" ON "TaskEngagementInboxItem"("agentId", "viewerReadAt", "createdAt");
CREATE INDEX "TaskEngagementInboxItem_agentId_agentDeliveredAt_createdAt_idx" ON "TaskEngagementInboxItem"("agentId", "agentDeliveredAt", "createdAt");

-- CreateEnum
CREATE TYPE "ForumEngagementType" AS ENUM ('LIKE', 'REPLY');

-- CreateTable
CREATE TABLE "ForumEngagementInboxItem" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "type" "ForumEngagementType" NOT NULL,
    "actorAgentId" TEXT NOT NULL,
    "replyId" TEXT,
    "replyPreview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "ForumEngagementInboxItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ForumEngagementInboxItem_agentId_readAt_createdAt_idx" ON "ForumEngagementInboxItem"("agentId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "ForumEngagementInboxItem_postId_createdAt_idx" ON "ForumEngagementInboxItem"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "ForumEngagementInboxItem_actorAgentId_idx" ON "ForumEngagementInboxItem"("actorAgentId");

-- AddForeignKey
ALTER TABLE "ForumEngagementInboxItem" ADD CONSTRAINT "ForumEngagementInboxItem_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumEngagementInboxItem" ADD CONSTRAINT "ForumEngagementInboxItem_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ForumPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumEngagementInboxItem" ADD CONSTRAINT "ForumEngagementInboxItem_actorAgentId_fkey" FOREIGN KEY ("actorAgentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

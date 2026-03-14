-- CreateEnum
CREATE TYPE "AgentActivityType" AS ENUM ('FORUM_POST_CREATED', 'FORUM_REPLY_CREATED', 'FORUM_LIKE_CREATED', 'TASK_CLAIMED', 'TASK_COMPLETED', 'POINT_EARNED', 'POINT_DEDUCTED', 'DAILY_CHECKIN', 'KNOWLEDGE_ARTICLE_CREATED', 'CREDENTIAL_CLAIMED', 'CREDENTIAL_ROTATED', 'CREDENTIAL_REVOKED', 'STATUS_CHANGED');

-- CreateTable
CREATE TABLE "AgentActivity" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "type" "AgentActivityType" NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentActivity_agentId_idx" ON "AgentActivity"("agentId");

-- CreateIndex
CREATE INDEX "AgentActivity_type_idx" ON "AgentActivity"("type");

-- CreateIndex
CREATE INDEX "AgentActivity_createdAt_idx" ON "AgentActivity"("createdAt");

-- CreateIndex
CREATE INDEX "AgentActivity_agentId_createdAt_idx" ON "AgentActivity"("agentId", "createdAt");

-- AddForeignKey
ALTER TABLE "AgentActivity" ADD CONSTRAINT "AgentActivity_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

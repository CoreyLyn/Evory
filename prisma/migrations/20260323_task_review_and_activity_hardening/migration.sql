-- AlterTable
ALTER TABLE "Task"
ADD COLUMN "reviewComment" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3);

-- AlterEnum
ALTER TYPE "AgentActivityType" ADD VALUE 'TASK_CREATED';

-- AlterEnum
ALTER TYPE "AgentActivityType" ADD VALUE 'TASK_VERIFIED';

-- AlterEnum
ALTER TYPE "AgentActivityType" ADD VALUE 'TASK_REJECTED';

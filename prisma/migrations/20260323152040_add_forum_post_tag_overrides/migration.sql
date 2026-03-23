-- CreateEnum
CREATE TYPE "ForumPostTagOverrideAction" AS ENUM ('ADD', 'REMOVE', 'LOCK');

-- CreateTable
CREATE TABLE "ForumPostTagOverride" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "action" "ForumPostTagOverrideAction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForumPostTagOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ForumPostTagOverride_postId_idx" ON "ForumPostTagOverride"("postId");

-- CreateIndex
CREATE INDEX "ForumPostTagOverride_tagId_idx" ON "ForumPostTagOverride"("tagId");

-- CreateIndex
CREATE INDEX "ForumPostTagOverride_action_idx" ON "ForumPostTagOverride"("action");

-- CreateIndex
CREATE UNIQUE INDEX "ForumPostTagOverride_postId_tagId_action_key" ON "ForumPostTagOverride"("postId", "tagId", "action");

-- AddForeignKey
ALTER TABLE "ForumPostTagOverride" ADD CONSTRAINT "ForumPostTagOverride_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ForumPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumPostTagOverride" ADD CONSTRAINT "ForumPostTagOverride_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "ForumTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;


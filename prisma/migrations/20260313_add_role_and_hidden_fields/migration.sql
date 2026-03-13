-- Add role column to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'USER';

-- Add hiddenAt column to ForumPost table
ALTER TABLE "ForumPost" ADD COLUMN IF NOT EXISTS "hiddenAt" TIMESTAMP(3);

-- Add hiddenAt column to ForumReply table
ALTER TABLE "ForumReply" ADD COLUMN IF NOT EXISTS "hiddenAt" TIMESTAMP(3);

-- Add hiddenAt indexes for admin filtering
CREATE INDEX IF NOT EXISTS "ForumPost_hiddenAt_idx" ON "ForumPost"("hiddenAt");
CREATE INDEX IF NOT EXISTS "ForumReply_hiddenAt_idx" ON "ForumReply"("hiddenAt");
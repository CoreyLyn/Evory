-- Add role column to User table
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'USER';

-- Add hiddenAt column to ForumPost table
ALTER TABLE "ForumPost" ADD COLUMN IF NOT EXISTS "hiddenAt" TIMESTAMP(3);

-- Add hiddenById column to ForumPost table (for admin who hid the post)
ALTER TABLE "ForumPost" ADD COLUMN IF NOT EXISTS "hiddenById" TEXT;

-- Add hiddenAt column to ForumReply table
ALTER TABLE "ForumReply" ADD COLUMN IF NOT EXISTS "hiddenAt" TIMESTAMP(3);

-- Add hiddenById column to ForumReply table (for admin who hid the reply)
ALTER TABLE "ForumReply" ADD COLUMN IF NOT EXISTS "hiddenById" TEXT;

-- Add hiddenAt indexes for admin filtering
CREATE INDEX IF NOT EXISTS "ForumPost_hiddenAt_idx" ON "ForumPost"("hiddenAt");
CREATE INDEX IF NOT EXISTS "ForumReply_hiddenAt_idx" ON "ForumReply"("hiddenAt");

-- Add foreign key constraints for hiddenById
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ForumPost_hiddenById_fkey'
  ) THEN
    ALTER TABLE "ForumPost" ADD CONSTRAINT "ForumPost_hiddenById_fkey"
      FOREIGN KEY ("hiddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ForumReply_hiddenById_fkey'
  ) THEN
    ALTER TABLE "ForumReply" ADD CONSTRAINT "ForumReply_hiddenById_fkey"
      FOREIGN KEY ("hiddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
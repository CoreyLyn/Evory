CREATE TYPE "ForumPostHiddenReason" AS ENUM ('ADMIN', 'OWNER');

ALTER TABLE "ForumPost"
ADD COLUMN "hiddenReason" "ForumPostHiddenReason";

CREATE INDEX "ForumPost_hiddenReason_idx" ON "ForumPost"("hiddenReason");

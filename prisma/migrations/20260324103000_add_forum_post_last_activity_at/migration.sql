ALTER TABLE "ForumPost"
  ADD COLUMN "lastActivityAt" TIMESTAMP(3);

UPDATE "ForumPost" AS p
SET "lastActivityAt" = COALESCE(
  (
    SELECT MAX(r."createdAt")
    FROM "ForumReply" AS r
    WHERE r."postId" = p."id"
  ),
  p."createdAt"
);

ALTER TABLE "ForumPost"
  ALTER COLUMN "lastActivityAt" SET NOT NULL,
  ALTER COLUMN "lastActivityAt" SET DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "ForumPost_lastActivityAt_idx"
  ON "ForumPost"("lastActivityAt");

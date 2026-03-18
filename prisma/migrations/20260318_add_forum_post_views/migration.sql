CREATE TABLE "ForumPostView" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "viewerKey" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForumPostView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ForumPostView_postId_viewerKey_windowStart_key"
  ON "ForumPostView"("postId", "viewerKey", "windowStart");

CREATE INDEX "ForumPostView_postId_windowStart_idx"
  ON "ForumPostView"("postId", "windowStart");

CREATE INDEX "ForumPostView_updatedAt_idx"
  ON "ForumPostView"("updatedAt");

ALTER TABLE "ForumPostView"
  ADD CONSTRAINT "ForumPostView_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "ForumPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

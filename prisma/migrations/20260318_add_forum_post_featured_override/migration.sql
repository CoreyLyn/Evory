ALTER TABLE "ForumPost"
ADD COLUMN "featuredOverride" BOOLEAN;

CREATE INDEX "ForumPost_featuredOverride_idx" ON "ForumPost"("featuredOverride");

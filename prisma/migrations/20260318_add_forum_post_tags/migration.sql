CREATE TYPE "ForumTagKind" AS ENUM ('CORE', 'FREEFORM');
CREATE TYPE "ForumPostTagSource" AS ENUM ('AUTO', 'MANUAL');

CREATE TABLE "ForumTag" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "kind" "ForumTagKind" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForumTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ForumPostTag" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "source" "ForumPostTagSource" NOT NULL DEFAULT 'AUTO',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ForumPostTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ForumTag_slug_key" ON "ForumTag"("slug");
CREATE UNIQUE INDEX "ForumPostTag_postId_tagId_key" ON "ForumPostTag"("postId", "tagId");
CREATE INDEX "ForumTag_kind_idx" ON "ForumTag"("kind");
CREATE INDEX "ForumTag_label_idx" ON "ForumTag"("label");
CREATE INDEX "ForumPostTag_postId_idx" ON "ForumPostTag"("postId");
CREATE INDEX "ForumPostTag_tagId_idx" ON "ForumPostTag"("tagId");
CREATE INDEX "ForumPostTag_source_idx" ON "ForumPostTag"("source");

ALTER TABLE "ForumPostTag"
  ADD CONSTRAINT "ForumPostTag_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "ForumPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ForumPostTag"
  ADD CONSTRAINT "ForumPostTag_tagId_fkey"
  FOREIGN KEY ("tagId") REFERENCES "ForumTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ForumTag" ("id", "slug", "label", "kind", "createdAt", "updatedAt")
VALUES
  ('forum-tag-frontend', 'frontend', 'Frontend', 'CORE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('forum-tag-backend', 'backend', 'Backend', 'CORE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('forum-tag-database', 'database', 'Database', 'CORE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('forum-tag-api', 'api', 'API', 'CORE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('forum-tag-bugfix', 'bugfix', 'Bugfix', 'CORE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('forum-tag-performance', 'performance', 'Performance', 'CORE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('forum-tag-deployment', 'deployment', 'Deployment', 'CORE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('forum-tag-testing', 'testing', 'Testing', 'CORE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('forum-tag-security', 'security', 'Security', 'CORE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('forum-tag-ux', 'ux', 'UX', 'CORE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

ALTER TABLE "ForumPost"
  ADD COLUMN IF NOT EXISTS "suggestedTags" JSONB NOT NULL DEFAULT '[]';

WITH "autoTagBaselines" AS (
  SELECT
    post.id AS "postId",
    COALESCE(
      (
        SELECT jsonb_agg(label ORDER BY "firstSeenAt", label)
        FROM (
          SELECT
            tag.label,
            MIN(relation."createdAt") AS "firstSeenAt"
          FROM "ForumPostTag" AS relation
          INNER JOIN "ForumTag" AS tag
            ON tag.id = relation."tagId"
          WHERE relation."postId" = post.id
            AND relation."source" = 'AUTO'
          GROUP BY tag.label
        ) AS "distinctLabels"
      ),
      '[]'::jsonb
    ) AS "suggestedTags"
  FROM "ForumPost" AS post
)
UPDATE "ForumPost" AS post
SET "suggestedTags" = baseline."suggestedTags"
FROM "autoTagBaselines" AS baseline
WHERE baseline."postId" = post.id;

DROP INDEX IF EXISTS "ForumTag_kind_idx";

ALTER TABLE "ForumTag"
  DROP COLUMN IF EXISTS "kind";

DROP TYPE IF EXISTS "ForumTagKind";

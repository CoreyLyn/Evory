import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

const migrationPath = path.resolve(
  process.cwd(),
  "prisma/migrations/20260325020000_split_interaction_read_state/migration.sql"
);

test("split interaction read state migration backfills viewer reads from agent delivery", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(
    sql,
    /UPDATE "ForumEngagementInboxItem"\s+SET "viewerReadAt" = "agentDeliveredAt"\s+WHERE "agentDeliveredAt" IS NOT NULL;/s
  );
  assert.match(
    sql,
    /UPDATE "TaskEngagementInboxItem"\s+SET "viewerReadAt" = "agentDeliveredAt"\s+WHERE "agentDeliveredAt" IS NOT NULL;/s
  );
});

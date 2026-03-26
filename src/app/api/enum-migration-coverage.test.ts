import "dotenv/config";
import assert from "node:assert/strict";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { Client } from "pg";

const pointActionMigrationPath = path.resolve(
  process.cwd(),
  "prisma/migrations/20260326_add_like_post_point_action_type/migration.sql"
);
const agentActivityMigrationPath = path.resolve(
  process.cwd(),
  "prisma/migrations/20260326_add_missing_agent_activity_types/migration.sql"
);

async function withDb<T>(callback: (client: Client) => Promise<T>) {
  const connectionString = process.env.DATABASE_URL;
  assert.ok(connectionString, "DATABASE_URL must be set for DB-backed tests");

  const client = new Client({ connectionString });
  await client.connect();

  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

function isConnectionRefusedError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  if ("code" in error && error.code === "ECONNREFUSED") {
    return true;
  }

  if (error instanceof AggregateError) {
    return error.errors.some((entry) => isConnectionRefusedError(entry));
  }

  return false;
}

test("like-post point action migration file exists", async () => {
  await access(pointActionMigrationPath, constants.F_OK);
  const sql = await readFile(pointActionMigrationPath, "utf8");

  assert.match(sql, /ALTER TYPE "PointActionType" ADD VALUE IF NOT EXISTS 'LIKE_POST';/);
});

test("missing agent activity type migration file exists", async () => {
  await access(agentActivityMigrationPath, constants.F_OK);
  const sql = await readFile(agentActivityMigrationPath, "utf8");

  assert.match(sql, /ALTER TYPE "AgentActivityType" ADD VALUE IF NOT EXISTS 'KNOWLEDGE_READ';/);
  assert.match(sql, /ALTER TYPE "AgentActivityType" ADD VALUE IF NOT EXISTS 'TASK_UNCLAIMED';/);
  assert.match(sql, /ALTER TYPE "AgentActivityType" ADD VALUE IF NOT EXISTS 'TASK_ABANDONED';/);
});

test("database point action enum includes LIKE_POST", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL must be set for DB-backed tests");
    return;
  }

  try {
    await withDb(async (client) => {
      const result = await client.query<{ enumlabel: string }>(`
        select e.enumlabel
        from pg_type t
        join pg_enum e on e.enumtypid = t.oid
        where t.typname = 'PointActionType'
        order by e.enumsortorder
      `);

      const values = result.rows.map((row) => row.enumlabel);

      assert.ok(
        values.includes("LIKE_POST"),
        'expected PointActionType enum to include "LIKE_POST"'
      );
    });
  } catch (error) {
    if (isConnectionRefusedError(error)) {
      t.skip("DATABASE_URL is set but the database is not reachable");
      return;
    }

    throw error;
  }
});

test("database agent activity enum includes audited values", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL must be set for DB-backed tests");
    return;
  }

  try {
    await withDb(async (client) => {
      const result = await client.query<{ enumlabel: string }>(`
        select e.enumlabel
        from pg_type t
        join pg_enum e on e.enumtypid = t.oid
        where t.typname = 'AgentActivityType'
        order by e.enumsortorder
      `);

      const values = result.rows.map((row) => row.enumlabel);

      assert.ok(
        values.includes("KNOWLEDGE_READ"),
        'expected AgentActivityType enum to include "KNOWLEDGE_READ"'
      );
      assert.ok(
        values.includes("TASK_UNCLAIMED"),
        'expected AgentActivityType enum to include "TASK_UNCLAIMED"'
      );
      assert.ok(
        values.includes("TASK_ABANDONED"),
        'expected AgentActivityType enum to include "TASK_ABANDONED"'
      );
    });
  } catch (error) {
    if (isConnectionRefusedError(error)) {
      t.skip("DATABASE_URL is set but the database is not reachable");
      return;
    }

    throw error;
  }
});

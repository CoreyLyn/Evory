import "dotenv/config";
import assert from "node:assert/strict";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { Client } from "pg";

const migrationPath = path.resolve(
  process.cwd(),
  "prisma/migrations/20260326170000_add_task_completion_note/migration.sql"
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

test("task completion note migration file exists", async () => {
  await access(migrationPath, constants.F_OK);
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /ALTER TABLE "Task"\s+ADD COLUMN "completionNote" TEXT;/);
});

test("database task table includes completionNote", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL must be set for DB-backed tests");
    return;
  }

  try {
    await withDb(async (client) => {
      const result = await client.query<{ column_name: string }>(`
        select column_name
        from information_schema.columns
        where table_name = 'Task'
        order by ordinal_position
      `);

      const values = result.rows.map((row) => row.column_name);

      assert.ok(
        values.includes("completionNote"),
        'expected Task table to include "completionNote"'
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

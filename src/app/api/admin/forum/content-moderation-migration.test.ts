import "dotenv/config";
import assert from "node:assert/strict";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { Client } from "pg";

const migrationPath = path.resolve(
  process.cwd(),
  "prisma/migrations/20260319_add_security_event_content_moderation_types/migration.sql"
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

test("content moderation security event migration file exists", async () => {
  await access(migrationPath, constants.F_OK);
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'CONTENT_HIDDEN';/);
  assert.match(
    sql,
    /ALTER TYPE "SecurityEventType" ADD VALUE IF NOT EXISTS 'CONTENT_RESTORED';/
  );
});

test("database security event enum includes content moderation values", async (t) => {
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
        where t.typname = 'SecurityEventType'
        order by e.enumsortorder
      `);

      const values = result.rows.map((row) => row.enumlabel);

      assert.ok(
        values.includes("CONTENT_HIDDEN"),
        'expected SecurityEventType enum to include "CONTENT_HIDDEN"'
      );
      assert.ok(
        values.includes("CONTENT_RESTORED"),
        'expected SecurityEventType enum to include "CONTENT_RESTORED"'
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

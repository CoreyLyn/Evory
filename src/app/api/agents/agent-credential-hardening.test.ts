import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { Client } from "pg";

const migrationsRoot = path.resolve(process.cwd(), "prisma/migrations");
const migrationLockFile = path.resolve(process.cwd(), "prisma/migrations/migration_lock.toml");
const migrationDir = path.resolve(
  process.cwd(),
  "prisma/migrations/20260310_agent_credential_consistency_hardening/migration.sql"
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

async function databaseUsesPrismaMigrations(client: Client) {
  const result = await client.query<{ exists: boolean }>(`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = '_prisma_migrations'
    ) as exists
  `);

  return result.rows[0]?.exists === true;
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

test("credential hardening migration file exists", async () => {
  await access(migrationDir, constants.F_OK);
  const sql = await readFile(migrationDir, "utf8");

  assert.match(sql, /AgentCredential/);
});

test("fresh databases have a schema baseline migration before credential hardening", async () => {
  const migrationEntries = (await readdir(migrationsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.ok(
    migrationEntries.length >= 2,
    "expected a baseline schema migration before the credential hardening migration"
  );

  const hardeningIndex = migrationEntries.indexOf(
    "20260310_agent_credential_consistency_hardening"
  );

  assert.ok(hardeningIndex > 0, "expected hardening migration to run after a baseline migration");

  const baselineMigrationSql = await readFile(
    path.join(migrationsRoot, migrationEntries[0], "migration.sql"),
    "utf8"
  );

  assert.match(
    baselineMigrationSql,
    /create table\s+"AgentCredential"/i,
    "expected the earliest migration to create AgentCredential for fresh databases"
  );
});

test("prisma migrations directory includes a provider lock file", async () => {
  await access(migrationLockFile, constants.F_OK);
  const contents = await readFile(migrationLockFile, "utf8");

  assert.match(contents, /provider\s*=\s*"postgresql"/i);
});

test("database enforces a single active credential per agent", async (t) => {
  if (!process.env.DATABASE_URL) {
    t.skip("DATABASE_URL must be set for DB-backed tests");
    return;
  }

  try {
    await withDb(async (client) => {
      if (!(await databaseUsesPrismaMigrations(client))) {
        t.skip("database was bootstrapped without Prisma migrations");
        return;
      }

      const result = await client.query<{
        indexname: string;
        indexdef: string;
      }>(`
        select indexname, indexdef
        from pg_indexes
        where schemaname = 'public'
          and tablename = 'AgentCredential'
      `);

      const activeCredentialIndex = result.rows.find((row) =>
        /unique/i.test(row.indexdef) &&
        /"agentId"/i.test(row.indexdef) &&
        /"revokedAt"\s+IS\s+NULL/i.test(row.indexdef)
      );

      assert.ok(
        activeCredentialIndex,
        "expected a unique partial index enforcing one active credential per agent"
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

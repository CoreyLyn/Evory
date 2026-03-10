import "dotenv/config";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { Client } from "pg";

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

test("credential hardening migration file exists", async () => {
  await access(migrationDir, constants.F_OK);
  const sql = await readFile(migrationDir, "utf8");

  assert.match(sql, /AgentCredential/);
});

test("database enforces a single active credential per agent", async () => {
  await withDb(async (client) => {
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
});

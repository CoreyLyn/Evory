import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import {
  ProductionStartupError,
  checkDatabaseReadiness,
  loadProductionEnvironment,
} from "@/lib/production-runtime";

test("loadProductionEnvironment rejects missing required env values", () => {
  assert.throws(
    () =>
      loadProductionEnvironment({
        DATABASE_URL: "",
      }),
    (error: unknown) => {
      assert.ok(error instanceof ProductionStartupError);
      assert.equal(error.code, "MISSING_ENV");
      assert.match(error.message, /DATABASE_URL/);
      return true;
    }
  );
});

test("loadProductionEnvironment normalizes production config", () => {
  const config = loadProductionEnvironment({
    DATABASE_URL: "  postgres://evory:test@localhost:5432/evory  ",
    NODE_ENV: "production",
    PORT: "4010",
    HOSTNAME: "0.0.0.0",
  });

  assert.deepEqual(config, {
    databaseUrl: "postgres://evory:test@localhost:5432/evory",
    nodeEnv: "production",
    port: 4010,
    hostname: "0.0.0.0",
  });
});

test("checkDatabaseReadiness reports probe failures cleanly", async () => {
  const result = await checkDatabaseReadiness("postgres://evory:test@localhost:5432/evory", {
    probe: async () => {
      throw new Error("database unavailable");
    },
  });

  assert.deepEqual(result, {
    ok: false,
    error: "database unavailable",
  });
});

test("package.json exposes production-safe prisma and startup scripts", async () => {
  const packageJson = JSON.parse(
    await readFile(path.resolve(process.cwd(), "package.json"), "utf8")
  ) as {
    scripts?: Record<string, string>;
  };

  assert.equal(packageJson.scripts?.["prisma:generate"], "npx prisma generate");
  assert.equal(packageJson.scripts?.["db:migrate:deploy"], "npx prisma migrate deploy");
  assert.equal(
    packageJson.scripts?.["start:prod"],
    "node scripts/production-startup.mjs start"
  );
  assert.equal(
    packageJson.scripts?.["smoke:staging:preclaim"],
    "node scripts/staging-smoke-pre-claim.mjs"
  );
  assert.equal(
    packageJson.scripts?.["smoke:staging:postclaim"],
    "node scripts/staging-smoke-post-claim.mjs"
  );
});

test("Dockerfile reuses the production startup contract", async () => {
  const dockerfile = path.resolve(process.cwd(), "Dockerfile");
  await access(dockerfile, constants.F_OK);

  const contents = await readFile(dockerfile, "utf8");

  assert.match(contents, /npm ci --ignore-scripts/);
  assert.match(contents, /npm run prisma:generate/);
  assert.match(contents, /npm run start:prod/);
});

test(".dockerignore excludes local env and build artifacts from Docker context", async () => {
  const dockerignore = path.resolve(process.cwd(), ".dockerignore");
  await access(dockerignore, constants.F_OK);

  const contents = await readFile(dockerignore, "utf8");

  assert.match(contents, /\.env\.\*/);
  assert.match(contents, /node_modules/);
  assert.match(contents, /\.next/);
});

test("staging smoke runbook exists and documents both smoke commands", async () => {
  const runbook = path.resolve(process.cwd(), "docs/runbooks/staging-agent-smoke.md");
  await access(runbook, constants.F_OK);

  const contents = await readFile(runbook, "utf8");

  assert.match(contents, /smoke:staging:preclaim/);
  assert.match(contents, /smoke:staging:postclaim/);
});

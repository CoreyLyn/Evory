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
    "node --import tsx scripts/staging-smoke-pre-claim.mjs"
  );
  assert.equal(
    packageJson.scripts?.["smoke:staging:postclaim"],
    "node --import tsx scripts/staging-smoke-post-claim.mjs"
  );
  assert.equal(
    packageJson.scripts?.["smoke:staging:verify-rotated"],
    "node --import tsx scripts/staging-smoke-verify-rotated.mjs"
  );
  assert.equal(
    packageJson.scripts?.["agent:credential:replace"],
    "node --import tsx scripts/agent-credential-replace.mjs"
  );
});

test("Dockerfile reuses the production startup contract", async () => {
  const dockerfile = path.resolve(process.cwd(), "Dockerfile");
  await access(dockerfile, constants.F_OK);

  const contents = await readFile(dockerfile, "utf8");

  assert.match(contents, /apt-get update -y && apt-get install -y openssl/);
  assert.match(contents, /npm ci --ignore-scripts/);
  assert.match(contents, /COPY --from=builder \/app\/prisma\.config\.ts \.\/prisma\.config\.ts/);
  assert.match(contents, /npm run prisma:generate/);
  assert.match(contents, /npm run start:prod/);
});

test(".dockerignore excludes local env and build artifacts from Docker context", async () => {
  const dockerignore = path.resolve(process.cwd(), ".dockerignore");
  await access(dockerignore, constants.F_OK);

  const contents = await readFile(dockerignore, "utf8");

  assert.match(contents, /\.env\.\*/);
  assert.match(contents, /^data\/?$/m);
  assert.match(contents, /node_modules/);
  assert.match(contents, /\.next/);
});

test("eslint ignores generated Prisma client artifacts", async () => {
  const eslintConfig = await readFile(path.resolve(process.cwd(), "eslint.config.mjs"), "utf8");

  assert.match(eslintConfig, /src\/generated\/prisma\/\*\*/);
});

test("staging smoke runbook exists and documents both smoke commands", async () => {
  const runbook = path.resolve(process.cwd(), "docs/runbooks/staging-agent-smoke.md");
  await access(runbook, constants.F_OK);

  const contents = await readFile(runbook, "utf8");

  assert.match(contents, /smoke:staging:preclaim/);
  assert.match(contents, /smoke:staging:postclaim/);
});

test("rotation verification runbook exists and documents rotate replace verification", async () => {
  const runbook = path.resolve(
    process.cwd(),
    "docs/runbooks/agent-key-rotation-verification.md"
  );
  await access(runbook, constants.F_OK);

  const contents = await readFile(runbook, "utf8");

  assert.match(contents, /\/settings\/agents/);
  assert.match(contents, /agent:credential:replace/);
  assert.match(contents, /smoke:staging:verify-rotated/);
});

test("smoke entrypoints import an explicit .mjs helper", async () => {
  const preclaimScript = await readFile(
    path.resolve(process.cwd(), "scripts/staging-smoke-pre-claim.mjs"),
    "utf8"
  );
  const postclaimScript = await readFile(
    path.resolve(process.cwd(), "scripts/staging-smoke-post-claim.mjs"),
    "utf8"
  );

  assert.match(preclaimScript, /\.\/lib\/staging-agent-smoke\.mjs/);
  assert.match(postclaimScript, /\.\/lib\/staging-agent-smoke\.mjs/);
});

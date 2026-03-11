import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AgentLocalCredentialError,
  clearAgentCredential,
  discoverAgentCredential,
  promoteAgentCredentialToBound,
  replaceAgentCredential,
  savePendingAgentCredential,
} from "./agent-local-credential";

async function createSandbox() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evory-agent-credential-"));
  const cwd = path.join(root, "workspace");
  const homeDir = path.join(root, "home");
  await mkdir(cwd, { recursive: true });
  await mkdir(homeDir, { recursive: true });

  return {
    cwd,
    homeDir,
    root,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
    canonicalPath: path.join(homeDir, ".config", "evory", "agents", "default.json"),
  };
}

async function writeCanonical(
  sandbox: Awaited<ReturnType<typeof createSandbox>>,
  content: unknown
) {
  await mkdir(path.dirname(sandbox.canonicalPath), { recursive: true });
  await writeFile(sandbox.canonicalPath, JSON.stringify(content, null, 2));
}

test("discoverAgentCredential prefers EVORY_AGENT_API_KEY over file sources", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await writeCanonical(sandbox, {
    agentId: "agt_file",
    apiKey: "evory_file",
    bindingStatus: "bound",
    updatedAt: "2026-03-11T00:00:00.000Z",
  });

  const result = await discoverAgentCredential({
    cwd: sandbox.cwd,
    env: { EVORY_AGENT_API_KEY: "evory_env" },
    homeDir: sandbox.homeDir,
  });

  assert.equal(result.source, "env_override");
  assert.equal(result.writable, false);
  assert.deepEqual(result.credential, {
    agentId: null,
    apiKey: "evory_env",
    bindingStatus: null,
    updatedAt: null,
  });
  assert.deepEqual(result.warnings, []);
});

test("discoverAgentCredential prefers the canonical file when no env override exists", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await writeCanonical(sandbox, {
    agentId: "agt_canonical",
    apiKey: "evory_canonical",
    bindingStatus: "bound",
    updatedAt: "2026-03-11T00:00:00.000Z",
  });

  const result = await discoverAgentCredential({
    cwd: sandbox.cwd,
    env: {},
    homeDir: sandbox.homeDir,
  });

  assert.equal(result.source, "canonical_file");
  assert.equal(result.writable, true);
  assert.deepEqual(result.credential, {
    agentId: "agt_canonical",
    apiKey: "evory_canonical",
    bindingStatus: "bound",
    updatedAt: "2026-03-11T00:00:00.000Z",
  });
  assert.deepEqual(result.warnings, []);
});

test("discoverAgentCredential returns none when no source exists", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  const result = await discoverAgentCredential({
    cwd: sandbox.cwd,
    env: {},
    homeDir: sandbox.homeDir,
  });

  assert.equal(result.source, "none");
  assert.equal(result.writable, true);
  assert.equal(result.credential, null);
  assert.deepEqual(result.warnings, []);
});

test("discoverAgentCredential ignores deprecated project-local fallback files", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await writeFile(path.join(sandbox.cwd, ".env.local"), "EVORY_AGENT_API_KEY=evory_dotenv\n");
  await mkdir(path.join(sandbox.cwd, ".evory"), { recursive: true });
  await writeFile(
    path.join(sandbox.cwd, ".evory", "agent.json"),
    JSON.stringify({
      agentId: "agt_project",
      apiKey: "evory_project",
      bindingStatus: "pending_binding",
      updatedAt: "2026-03-09T00:00:00.000Z",
    })
  );

  const result = await discoverAgentCredential({
    cwd: sandbox.cwd,
    env: {},
    homeDir: sandbox.homeDir,
  });

  assert.equal(result.source, "none");
  assert.equal(result.credential, null);
  assert.deepEqual(result.warnings, []);
});

test("discoverAgentCredential reports invalid canonical files as structured errors", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await mkdir(path.dirname(sandbox.canonicalPath), { recursive: true });
  await writeFile(sandbox.canonicalPath, '{"apiKey": ');

  const result = await discoverAgentCredential({
    cwd: sandbox.cwd,
    env: {},
    homeDir: sandbox.homeDir,
  });

  assert.equal(result.source, "canonical_file");
  assert.equal(result.credential, null);
  assert.equal(result.error?.code, "invalid_canonical_file");
});

test("savePendingAgentCredential writes the canonical file and generates updatedAt", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  const record = await savePendingAgentCredential(
    {
      agentId: "agt_pending",
      apiKey: "evory_pending",
    },
    {
      cwd: sandbox.cwd,
      homeDir: sandbox.homeDir,
    }
  );

  assert.equal(record.agentId, "agt_pending");
  assert.equal(record.apiKey, "evory_pending");
  assert.equal(record.bindingStatus, "pending_binding");
  assert.match(record.updatedAt, /^\d{4}-\d{2}-\d{2}T/);

  const persisted = JSON.parse(await readFile(sandbox.canonicalPath, "utf8")) as {
    agentId: string;
    apiKey: string;
    bindingStatus: string;
    updatedAt: string;
  };
  assert.deepEqual(persisted, record);

  const permissions = (await stat(sandbox.canonicalPath)).mode & 0o777;
  assert.equal(permissions, 0o600);
});

test("savePendingAgentCredential rejects empty values after trimming", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await assert.rejects(
    () =>
      savePendingAgentCredential(
        {
          agentId: "   ",
          apiKey: "evory_pending",
        },
        {
          cwd: sandbox.cwd,
          homeDir: sandbox.homeDir,
        }
      ),
    (error: unknown) => {
      assert.ok(error instanceof AgentLocalCredentialError);
      assert.equal(error.code, "invalid_input");
      return true;
    }
  );

  await assert.rejects(
    async () => access(sandbox.canonicalPath, constants.F_OK),
    /ENOENT/
  );
});

test("promoteAgentCredentialToBound updates only the binding status", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  const saved = await savePendingAgentCredential(
    {
      agentId: "agt_promote",
      apiKey: "evory_pending",
    },
    {
      cwd: sandbox.cwd,
      homeDir: sandbox.homeDir,
      now: new Date("2026-03-11T00:00:00.000Z"),
    }
  );

  const promoted = await promoteAgentCredentialToBound("agt_promote", {
    cwd: sandbox.cwd,
    homeDir: sandbox.homeDir,
    now: new Date("2026-03-12T00:00:00.000Z"),
  });

  assert.equal(promoted.agentId, saved.agentId);
  assert.equal(promoted.apiKey, saved.apiKey);
  assert.equal(promoted.bindingStatus, "bound");
  assert.equal(promoted.updatedAt, "2026-03-12T00:00:00.000Z");
});

test("replaceAgentCredential updates the key and timestamp while preserving identity", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await savePendingAgentCredential(
    {
      agentId: "agt_replace",
      apiKey: "evory_old",
    },
    {
      cwd: sandbox.cwd,
      homeDir: sandbox.homeDir,
      now: new Date("2026-03-11T00:00:00.000Z"),
    }
  );
  await promoteAgentCredentialToBound("agt_replace", {
    cwd: sandbox.cwd,
    homeDir: sandbox.homeDir,
    now: new Date("2026-03-11T01:00:00.000Z"),
  });

  const replaced = await replaceAgentCredential(
    {
      agentId: "agt_replace",
      apiKey: "evory_new",
    },
    {
      cwd: sandbox.cwd,
      homeDir: sandbox.homeDir,
      now: new Date("2026-03-11T02:00:00.000Z"),
    }
  );

  assert.deepEqual(replaced, {
    agentId: "agt_replace",
    apiKey: "evory_new",
    bindingStatus: "bound",
    updatedAt: "2026-03-11T02:00:00.000Z",
  });
});

test("replaceAgentCredential rejects empty api keys after trimming", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await savePendingAgentCredential(
    {
      agentId: "agt_replace",
      apiKey: "evory_old",
    },
    {
      cwd: sandbox.cwd,
      homeDir: sandbox.homeDir,
    }
  );

  await assert.rejects(
    () =>
      replaceAgentCredential(
        {
          agentId: "agt_replace",
          apiKey: "   ",
        },
        {
          cwd: sandbox.cwd,
          homeDir: sandbox.homeDir,
        }
      ),
    (error: unknown) => {
      assert.ok(error instanceof AgentLocalCredentialError);
      assert.equal(error.code, "invalid_input");
      return true;
    }
  );
});

test("clearAgentCredential removes only the canonical file", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await savePendingAgentCredential(
    {
      agentId: "agt_clear",
      apiKey: "evory_clear",
    },
    {
      cwd: sandbox.cwd,
      homeDir: sandbox.homeDir,
    }
  );

  await clearAgentCredential("agt_clear", {
    cwd: sandbox.cwd,
    homeDir: sandbox.homeDir,
  });

  await assert.rejects(
    async () => access(sandbox.canonicalPath, constants.F_OK),
    /ENOENT/
  );
});

test("promote, replace, and clear reject identity mismatches", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await savePendingAgentCredential(
    {
      agentId: "agt_owner",
      apiKey: "evory_owner",
    },
    {
      cwd: sandbox.cwd,
      homeDir: sandbox.homeDir,
    }
  );

  await assert.rejects(
    () =>
      promoteAgentCredentialToBound("agt_other", {
        cwd: sandbox.cwd,
        homeDir: sandbox.homeDir,
      }),
    (error: unknown) => {
      assert.ok(error instanceof AgentLocalCredentialError);
      assert.equal(error.code, "agent_id_mismatch");
      return true;
    }
  );

  await assert.rejects(
    () =>
      replaceAgentCredential(
        {
          agentId: "agt_other",
          apiKey: "evory_other",
        },
        {
          cwd: sandbox.cwd,
          homeDir: sandbox.homeDir,
        }
      ),
    (error: unknown) => {
      assert.ok(error instanceof AgentLocalCredentialError);
      assert.equal(error.code, "agent_id_mismatch");
      return true;
    }
  );

  await assert.rejects(
    () =>
      clearAgentCredential("agt_other", {
        cwd: sandbox.cwd,
        homeDir: sandbox.homeDir,
      }),
    (error: unknown) => {
      assert.ok(error instanceof AgentLocalCredentialError);
      assert.equal(error.code, "agent_id_mismatch");
      return true;
    }
  );
});

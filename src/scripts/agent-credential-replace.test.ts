import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AgentCredentialReplaceCommandError,
  parseAgentCredentialReplaceArgs,
  readApiKeyFromStdin,
  runAgentCredentialReplace,
} from "../../scripts/agent-credential-replace.mjs";

async function createSandbox() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evory-agent-credential-replace-"));
  const cwd = path.join(root, "workspace");
  const homeDir = path.join(root, "home");
  const canonicalPath = path.join(
    homeDir,
    ".config",
    "evory",
    "agents",
    "default.json"
  );

  await mkdir(cwd, { recursive: true });
  await mkdir(homeDir, { recursive: true });

  return {
    cwd,
    homeDir,
    canonicalPath,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
}

async function writeCanonical(
  sandbox: Awaited<ReturnType<typeof createSandbox>>,
  content: unknown
) {
  await mkdir(path.dirname(sandbox.canonicalPath), { recursive: true });
  await writeFile(sandbox.canonicalPath, `${JSON.stringify(content, null, 2)}\n`);
}

test("parseAgentCredentialReplaceArgs reads required flags", () => {
  const parsed = parseAgentCredentialReplaceArgs(["--agent-id", "agt_rotate"]);

  assert.deepEqual(parsed, {
    agentId: "agt_rotate",
  });
});

test("parseAgentCredentialReplaceArgs rejects missing agent id", () => {
  assert.throws(
    () => parseAgentCredentialReplaceArgs([]),
    (error: unknown) => {
      assert.ok(error instanceof AgentCredentialReplaceCommandError);
      assert.equal(error.code, "missing_arg");
      assert.match(error.message, /agent-id/);
      return true;
    }
  );
});

test("parseAgentCredentialReplaceArgs rejects the legacy api-key flag", () => {
  assert.throws(
    () =>
      parseAgentCredentialReplaceArgs([
        "--agent-id",
        "agt_rotate",
        "--api-key",
        "evory_new",
      ]),
    (error: unknown) => {
      assert.ok(error instanceof AgentCredentialReplaceCommandError);
      assert.equal(error.code, "unsupported_arg");
      assert.match(error.message, /stdin/i);
      return true;
    }
  );
});

test("readApiKeyFromStdin returns trimmed input", async () => {
  const apiKey = await readApiKeyFromStdin(async () => "  evory_new  \n");

  assert.equal(apiKey, "evory_new");
});

test("readApiKeyFromStdin rejects empty input", async () => {
  await assert.rejects(
    () => readApiKeyFromStdin(async () => "   \n"),
    (error: unknown) => {
      assert.ok(error instanceof AgentCredentialReplaceCommandError);
      assert.equal(error.code, "missing_stdin");
      assert.match(error.message, /stdin/i);
      return true;
    }
  );
});

test("runAgentCredentialReplace replaces the canonical credential", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await writeCanonical(sandbox, {
    agentId: "agt_rotate",
    apiKey: "evory_old",
    bindingStatus: "bound",
    updatedAt: "2026-03-11T00:00:00.000Z",
  });

  const result = await runAgentCredentialReplace(
    {
      agentId: "agt_rotate",
      apiKey: "evory_new",
    },
    {
      cwd: sandbox.cwd,
      homeDir: sandbox.homeDir,
    }
  );

  assert.equal(result.success, true);
  assert.match(result.message, /agt_rotate/);
  assert.match(result.message, /default\.json/);
});

test("runAgentCredentialReplace fails when the canonical credential is missing", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await assert.rejects(
    () =>
      runAgentCredentialReplace(
        {
          agentId: "agt_rotate",
          apiKey: "evory_new",
        },
        {
          cwd: sandbox.cwd,
          homeDir: sandbox.homeDir,
        }
      ),
    (error: unknown) => {
      assert.ok(error instanceof AgentCredentialReplaceCommandError);
      assert.equal(error.code, "missing_canonical_file");
      return true;
    }
  );
});

test("runAgentCredentialReplace fails when the canonical credential belongs to a different agent", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await writeCanonical(sandbox, {
    agentId: "agt_other",
    apiKey: "evory_old",
    bindingStatus: "bound",
    updatedAt: "2026-03-11T00:00:00.000Z",
  });

  await assert.rejects(
    () =>
      runAgentCredentialReplace(
        {
          agentId: "agt_rotate",
          apiKey: "evory_new",
        },
        {
          cwd: sandbox.cwd,
          homeDir: sandbox.homeDir,
        }
      ),
    (error: unknown) => {
      assert.ok(error instanceof AgentCredentialReplaceCommandError);
      assert.equal(error.code, "agent_id_mismatch");
      return true;
    }
  );
});

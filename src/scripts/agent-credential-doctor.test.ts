import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AgentCredentialDoctorCommandError,
  parseAgentCredentialDoctorArgs,
  runAgentCredentialDoctor,
} from "../../scripts/agent-credential-doctor.mjs";

async function createSandbox() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evory-agent-credential-doctor-"));
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

async function readCanonical(
  sandbox: Awaited<ReturnType<typeof createSandbox>>
) {
  return JSON.parse(await readFile(sandbox.canonicalPath, "utf8")) as {
    agentId: string;
    apiKey: string;
    bindingStatus: string;
    updatedAt: string;
  };
}

function createJsonResponse(
  status: number,
  data: unknown,
  headers: Record<string, string> = {}
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name: string) {
        const key = Object.keys(headers).find(
          (entry) => entry.toLowerCase() === name.toLowerCase()
        );
        return key ? headers[key] : null;
      },
    },
    async json() {
      return data;
    },
  };
}

test("parseAgentCredentialDoctorArgs requires agent id", () => {
  const parsed = parseAgentCredentialDoctorArgs(["--agent-id", "agt_doctor"]);

  assert.deepEqual(parsed, {
    agentId: "agt_doctor",
  });
});

test("parseAgentCredentialDoctorArgs rejects missing agent id", () => {
  assert.throws(
    () => parseAgentCredentialDoctorArgs([]),
    (error: unknown) => {
      assert.ok(error instanceof AgentCredentialDoctorCommandError);
      assert.equal(error.code, "missing_arg");
      return true;
    }
  );
});

test("runAgentCredentialDoctor fails when the canonical credential is missing", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await assert.rejects(
    () =>
      runAgentCredentialDoctor(
        {
          agentId: "agt_doctor",
          baseUrl: "https://staging.example.com",
        },
        {
          cwd: sandbox.cwd,
          homeDir: sandbox.homeDir,
          fetch: async () => createJsonResponse(200, { success: true, data: [] }),
        }
      ),
    (error: unknown) => {
      assert.ok(error instanceof AgentCredentialDoctorCommandError);
      assert.equal(error.code, "missing_canonical_file");
      return true;
    }
  );
});

test("runAgentCredentialDoctor promotes pending_binding credentials after a successful official read", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await writeCanonical(sandbox, {
    agentId: "agt_doctor",
    apiKey: "evory_valid",
    bindingStatus: "pending_binding",
    updatedAt: "2026-03-11T00:00:00.000Z",
  });

  const result = await runAgentCredentialDoctor(
    {
      agentId: "agt_doctor",
      baseUrl: "https://staging.example.com",
    },
    {
      cwd: sandbox.cwd,
      homeDir: sandbox.homeDir,
      fetch: async () =>
        createJsonResponse(
          200,
          { success: true, data: [] },
          { "X-Evory-Agent-API": "official" }
        ),
    }
  );

  const saved = await readCanonical(sandbox);
  assert.equal(result.success, true);
  assert.equal(result.validation, "PASS");
  assert.equal(result.reason, null);
  assert.equal(result.promoted, true);
  assert.match(result.message, /promotion: bound/);
  assert.equal(saved.bindingStatus, "bound");
});

test("runAgentCredentialDoctor leaves bound credentials unchanged after a successful official read", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await writeCanonical(sandbox, {
    agentId: "agt_doctor",
    apiKey: "evory_valid",
    bindingStatus: "bound",
    updatedAt: "2026-03-11T00:00:00.000Z",
  });

  const result = await runAgentCredentialDoctor(
    {
      agentId: "agt_doctor",
      baseUrl: "https://staging.example.com",
    },
    {
      cwd: sandbox.cwd,
      homeDir: sandbox.homeDir,
      fetch: async () =>
        createJsonResponse(
          200,
          { success: true, data: [] },
          { "X-Evory-Agent-API": "official" }
        ),
    }
  );

  const saved = await readCanonical(sandbox);
  assert.equal(result.success, true);
  assert.equal(result.promoted, false);
  assert.match(result.message, /promotion: unchanged/);
  assert.equal(saved.bindingStatus, "bound");
});

test("runAgentCredentialDoctor reports revoked credentials without mutating the canonical file", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await writeCanonical(sandbox, {
    agentId: "agt_doctor",
    apiKey: "evory_revoked",
    bindingStatus: "pending_binding",
    updatedAt: "2026-03-11T00:00:00.000Z",
  });

  const result = await runAgentCredentialDoctor(
    {
      agentId: "agt_doctor",
      baseUrl: "https://staging.example.com",
    },
    {
      cwd: sandbox.cwd,
      homeDir: sandbox.homeDir,
      fetch: async () =>
        createJsonResponse(
          401,
          {
            error: "Unauthorized: Agent credential revoked",
            reason: "revoked",
          },
          { "X-Evory-Agent-API": "official" }
        ),
    }
  );

  const saved = await readCanonical(sandbox);
  assert.equal(result.success, false);
  assert.equal(result.validation, "FAIL");
  assert.equal(result.reason, "revoked");
  assert.equal(result.promoted, false);
  assert.match(result.message, /next-action: rotate the key/i);
  assert.equal(saved.bindingStatus, "pending_binding");
});

test("runAgentCredentialDoctor reports expired credentials without mutating the canonical file", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await writeCanonical(sandbox, {
    agentId: "agt_doctor",
    apiKey: "evory_expired",
    bindingStatus: "pending_binding",
    updatedAt: "2026-03-11T00:00:00.000Z",
  });

  const result = await runAgentCredentialDoctor(
    {
      agentId: "agt_doctor",
      baseUrl: "https://staging.example.com",
    },
    {
      cwd: sandbox.cwd,
      homeDir: sandbox.homeDir,
      fetch: async () =>
        createJsonResponse(
          401,
          {
            error: "Unauthorized: Agent credential expired",
            reason: "expired",
          },
          { "X-Evory-Agent-API": "official" }
        ),
    }
  );

  const saved = await readCanonical(sandbox);
  assert.equal(result.success, false);
  assert.equal(result.reason, "expired");
  assert.equal(result.promoted, false);
  assert.match(result.message, /next-action: rotate the key/i);
  assert.equal(saved.bindingStatus, "pending_binding");
});

test("runAgentCredentialDoctor rejects agent id mismatches before validation", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => sandbox.cleanup());

  await writeCanonical(sandbox, {
    agentId: "agt_other",
    apiKey: "evory_valid",
    bindingStatus: "pending_binding",
    updatedAt: "2026-03-11T00:00:00.000Z",
  });

  await assert.rejects(
    () =>
      runAgentCredentialDoctor(
        {
          agentId: "agt_doctor",
          baseUrl: "https://staging.example.com",
        },
        {
          cwd: sandbox.cwd,
          homeDir: sandbox.homeDir,
          fetch: async () =>
            createJsonResponse(
              200,
              { success: true, data: [] },
              { "X-Evory-Agent-API": "official" }
            ),
        }
      ),
    (error: unknown) => {
      assert.ok(error instanceof AgentCredentialDoctorCommandError);
      assert.equal(error.code, "agent_id_mismatch");
      return true;
    }
  );
});

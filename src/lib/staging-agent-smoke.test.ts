import assert from "node:assert/strict";
import test from "node:test";

import {
  StagingAgentSmokeError,
  formatSmokeSummary,
  loadPostClaimSmokeEnvironment,
  loadPreClaimSmokeEnvironment,
  resolvePostClaimSmokeContext,
  resolveRotatedCredentialVerificationContext,
  runPostClaimSmoke,
  runPreClaimSmoke,
  runRotatedCredentialVerification,
} from "../../scripts/lib/staging-agent-smoke.mjs";

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

function createSmokeFetch() {
  return async (url: string, init?: { method?: string }) => {
    if (url.endsWith("/api/health")) {
      return createJsonResponse(200, { ok: true });
    }

    if (url.endsWith("/api/agent/tasks") && init?.method === "GET") {
      return createJsonResponse(
        200,
        { success: true, data: [] },
        { "X-Evory-Agent-API": "official" }
      );
    }

    if (url.endsWith("/api/tasks")) {
      return createJsonResponse(
        200,
        { success: true },
        { "X-Evory-Agent-API": "not-for-agents" }
      );
    }

    if (url.endsWith("/api/agents/register")) {
      return createJsonResponse(200, {
        success: true,
        data: {
          id: "agt_smoke",
          apiKey: "evory_smoke",
        },
      });
    }

    if (url.endsWith("/api/agent/forum/posts") && init?.method === "GET") {
      return createJsonResponse(
        200,
        { success: true, data: [] },
        { "X-Evory-Agent-API": "official" }
      );
    }

    if (url.includes("/api/agent/knowledge/search") && init?.method === "GET") {
      return createJsonResponse(
        200,
        { success: true, data: [] },
        { "X-Evory-Agent-API": "official" }
      );
    }

    if (url.endsWith("/api/agent/forum/posts") && init?.method === "POST") {
      return createJsonResponse(
        200,
        { success: true, data: { id: "post_1" } },
        { "X-Evory-Agent-API": "official" }
      );
    }

    if (url.endsWith("/api/agent/knowledge/articles") && init?.method === "POST") {
      return createJsonResponse(
        200,
        { success: true, data: { id: "article_1" } },
        { "X-Evory-Agent-API": "official" }
      );
    }

    if (url.endsWith("/api/agent/tasks") && init?.method === "POST") {
      return createJsonResponse(
        200,
        { success: true, data: { id: "task_1" } },
        { "X-Evory-Agent-API": "official" }
      );
    }

    if (url.endsWith("/api/agent/tasks/task_1/verify")) {
      return createJsonResponse(
        400,
        { error: "Task must be completed before verification." },
        { "X-Evory-Agent-API": "official" }
      );
    }

    throw new Error(`Unexpected fetch call: ${init?.method ?? "GET"} ${url}`);
  };
}

test("loadPreClaimSmokeEnvironment rejects missing BASE_URL", () => {
  assert.throws(
    () =>
      loadPreClaimSmokeEnvironment({
        BASE_URL: "",
      }),
    (error: unknown) => {
      assert.ok(error instanceof StagingAgentSmokeError);
      assert.equal(error.code, "MISSING_ENV");
      assert.match(error.message, /BASE_URL/);
      return true;
    }
  );
});

test("loadPostClaimSmokeEnvironment rejects missing SMOKE_AGENT_API_KEY", () => {
  assert.throws(
    () =>
      loadPostClaimSmokeEnvironment({
        BASE_URL: "https://staging.example.com",
        SMOKE_AGENT_API_KEY: "",
      }),
    (error: unknown) => {
      assert.ok(error instanceof StagingAgentSmokeError);
      assert.equal(error.code, "MISSING_ENV");
      assert.match(error.message, /SMOKE_AGENT_API_KEY/);
      return true;
    }
  );
});

test("loadPreClaimSmokeEnvironment normalizes optional settings", () => {
  const config = loadPreClaimSmokeEnvironment({
    BASE_URL: " https://staging.example.com/ ",
    SMOKE_AGENT_NAME_PREFIX: " custom-prefix ",
    SMOKE_TIMEOUT_MS: "12000",
  });

  assert.deepEqual(config, {
    baseUrl: "https://staging.example.com",
    agentNamePrefix: "custom-prefix",
    timeoutMs: 12000,
  });
});

test("formatSmokeSummary prints PASS FAIL and SKIP rows", () => {
  const summary = formatSmokeSummary({
    stage: "post-claim",
    steps: [
      { name: "health", status: "PASS", detail: "ready" },
      { name: "register", status: "FAIL", detail: "403 forbidden" },
      { name: "verify-negative", status: "SKIP", detail: "no second key" },
    ],
    success: false,
    nextAction: "Claim the temp agent, then rerun the post-claim script.",
  });

  assert.match(summary, /\[PASS\] health/);
  assert.match(summary, /\[FAIL\] register/);
  assert.match(summary, /\[SKIP\] verify-negative/);
  assert.match(summary, /OVERALL: FAIL/);
  assert.match(summary, /Next: Claim the temp agent/);
});

test("runPreClaimSmoke saves a canonical pending_binding credential after registration", async () => {
  const calls: Array<{ agentId: string; apiKey: string }> = [];

  const result = await runPreClaimSmoke(
    {
      baseUrl: "https://staging.example.com",
      agentNamePrefix: "smoke",
      timeoutMs: 5000,
    },
    {
      fetch: createSmokeFetch(),
      now: new Date("2026-03-11T00:00:00.000Z"),
      credentialStore: {
        async savePendingAgentCredential(input: { agentId: string; apiKey: string }) {
          calls.push(input);
          return {
            ...input,
            bindingStatus: "pending_binding",
            updatedAt: "2026-03-11T00:00:00.000Z",
          };
        },
      },
    }
  );

  assert.equal(result.success, true);
  assert.deepEqual(calls, [{ agentId: "agt_smoke", apiKey: "evory_smoke" }]);
  assert.ok(
    result.steps.some(
      (step) => step.name === "credential-persist" && step.status === "PASS"
    )
  );
});

test("runPreClaimSmoke fails if saving the canonical credential fails", async () => {
  const result = await runPreClaimSmoke(
    {
      baseUrl: "https://staging.example.com",
      agentNamePrefix: "smoke",
      timeoutMs: 5000,
    },
    {
      fetch: createSmokeFetch(),
      now: new Date("2026-03-11T00:00:00.000Z"),
      credentialStore: {
        async savePendingAgentCredential() {
          throw new Error("disk full");
        },
      },
    }
  );

  assert.equal(result.success, false);
  assert.match(
    result.steps.at(-1)?.detail ?? "",
    /disk full/
  );
});

test("resolvePostClaimSmokeContext prefers SMOKE_AGENT_API_KEY over local discovery", async () => {
  let discovered = false;
  const context = await resolvePostClaimSmokeContext(
    {
      BASE_URL: "https://staging.example.com",
      SMOKE_AGENT_API_KEY: "evory_override",
    },
    {
      credentialStore: {
        async discoverAgentCredential() {
          discovered = true;
          return {
            source: "canonical_file",
            writable: true,
            credential: {
              agentId: "agt_canonical",
              apiKey: "evory_canonical",
              bindingStatus: "pending_binding",
              updatedAt: "2026-03-11T00:00:00.000Z",
            },
            warnings: [],
          };
        },
      },
    }
  );

  assert.equal(context.credentialSource, "env_override");
  assert.equal(context.config.apiKey, "evory_override");
  assert.equal(context.shouldPromoteCanonicalCredential, false);
  assert.equal(discovered, false);
});

test("resolvePostClaimSmokeContext uses discovered canonical credentials when override is absent", async () => {
  const context = await resolvePostClaimSmokeContext(
    {
      BASE_URL: "https://staging.example.com",
    },
    {
      credentialStore: {
        async discoverAgentCredential() {
          return {
            source: "canonical_file",
            writable: true,
            credential: {
              agentId: "agt_canonical",
              apiKey: "evory_canonical",
              bindingStatus: "pending_binding",
              updatedAt: "2026-03-11T00:00:00.000Z",
            },
            warnings: [],
          };
        },
      },
    }
  );

  assert.equal(context.credentialSource, "canonical_file");
  assert.equal(context.config.apiKey, "evory_canonical");
  assert.equal(context.shouldPromoteCanonicalCredential, true);
  assert.equal(context.agentId, "agt_canonical");
});

test("resolveRotatedCredentialVerificationContext uses the local env override when present", async () => {
  const context = await resolveRotatedCredentialVerificationContext(
    {
      BASE_URL: "https://staging.example.com",
      EVORY_AGENT_API_KEY: "evory_override",
    },
    {
      credentialStore: {
        async discoverAgentCredential() {
          return {
            source: "canonical_file",
            writable: true,
            credential: {
              agentId: "agt_canonical",
              apiKey: "evory_canonical",
              bindingStatus: "bound",
              updatedAt: "2026-03-11T00:00:00.000Z",
            },
            warnings: [],
          };
        },
      },
    }
  );

  assert.equal(context.credentialSource, "env_override");
  assert.equal(context.config.apiKey, "evory_override");
});

test("resolveRotatedCredentialVerificationContext uses canonical discovery when no override exists", async () => {
  const context = await resolveRotatedCredentialVerificationContext(
    {
      BASE_URL: "https://staging.example.com",
    },
    {
      credentialStore: {
        async discoverAgentCredential() {
          return {
            source: "canonical_file",
            writable: true,
            credential: {
              agentId: "agt_canonical",
              apiKey: "evory_canonical",
              bindingStatus: "bound",
              updatedAt: "2026-03-11T00:00:00.000Z",
            },
            warnings: [],
          };
        },
      },
    }
  );

  assert.equal(context.credentialSource, "canonical_file");
  assert.equal(context.config.apiKey, "evory_canonical");
});

test("runPostClaimSmoke promotes canonical credentials after the first successful official read", async () => {
  const promoted: string[] = [];

  const result = await runPostClaimSmoke(
    {
      config: {
        baseUrl: "https://staging.example.com",
        timeoutMs: 5000,
        apiKey: "evory_canonical",
        assigneeApiKey: null,
      },
      credentialSource: "canonical_file",
      credentialWarnings: [],
      shouldPromoteCanonicalCredential: true,
      agentId: "agt_canonical",
    },
    {
      fetch: createSmokeFetch(),
      now: new Date("2026-03-11T00:00:00.000Z"),
      credentialStore: {
        async promoteAgentCredentialToBound(agentId: string) {
          promoted.push(agentId);
          return {
            agentId,
            apiKey: "evory_canonical",
            bindingStatus: "bound",
            updatedAt: "2026-03-11T00:00:00.000Z",
          };
        },
      },
    }
  );

  assert.equal(result.success, true);
  assert.deepEqual(promoted, ["agt_canonical"]);
  assert.ok(
    result.steps.some(
      (step) => step.name === "credential-promote" && step.status === "PASS"
    )
  );
});

test("runPostClaimSmoke fails clearly when canonical promotion fails", async () => {
  const result = await runPostClaimSmoke(
    {
      config: {
        baseUrl: "https://staging.example.com",
        timeoutMs: 5000,
        apiKey: "evory_canonical",
        assigneeApiKey: null,
      },
      credentialSource: "canonical_file",
      credentialWarnings: [],
      shouldPromoteCanonicalCredential: true,
      agentId: "agt_canonical",
    },
    {
      fetch: createSmokeFetch(),
      now: new Date("2026-03-11T00:00:00.000Z"),
      credentialStore: {
        async promoteAgentCredentialToBound() {
          throw new Error("promote failed");
        },
      },
    }
  );

  assert.equal(result.success, false);
  assert.match(result.steps.at(-1)?.detail ?? "", /promote failed/);
});

test("runRotatedCredentialVerification validates the rotated credential with official reads", async () => {
  const result = await runRotatedCredentialVerification(
    {
      config: {
        baseUrl: "https://staging.example.com",
        timeoutMs: 5000,
        apiKey: "evory_rotated",
      },
      credentialSource: "canonical_file",
    },
    {
      fetch: createSmokeFetch(),
    }
  );

  assert.equal(result.success, true);
  assert.ok(
    result.steps.some((step) => step.name === "tasks-read" && step.status === "PASS")
  );
  assert.ok(
    result.steps.some((step) => step.name === "forum-read" && step.status === "PASS")
  );
  assert.ok(
    result.steps.some((step) => step.name === "knowledge-read" && step.status === "PASS")
  );
});

test("runRotatedCredentialVerification fails clearly when an official read fails", async () => {
  const failingFetch = async (url: string, init?: { method?: string }) => {
    if (url.endsWith("/api/agent/tasks") && init?.method === "GET") {
      return createJsonResponse(
        401,
        { error: "Unauthorized" },
        { "X-Evory-Agent-API": "official" }
      );
    }

    throw new Error(`Unexpected fetch call: ${init?.method ?? "GET"} ${url}`);
  };

  const result = await runRotatedCredentialVerification(
    {
      config: {
        baseUrl: "https://staging.example.com",
        timeoutMs: 5000,
        apiKey: "evory_rotated",
      },
      credentialSource: "canonical_file",
    },
    {
      fetch: failingFetch,
    }
  );

  assert.equal(result.success, false);
  assert.match(result.steps.at(-1)?.detail ?? "", /Unauthorized/);
});

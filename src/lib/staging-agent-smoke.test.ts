import assert from "node:assert/strict";
import test from "node:test";

import {
  StagingAgentSmokeError,
  formatSmokeSummary,
  loadPostClaimSmokeEnvironment,
  loadPreClaimSmokeEnvironment,
} from "@/lib/staging-agent-smoke";

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

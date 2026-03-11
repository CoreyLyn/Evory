export class StagingAgentSmokeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StagingAgentSmokeError";
    this.code = code;
  }
}

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_AGENT_NAME_PREFIX = "staging-smoke";
const DEFAULT_AGENT_TYPE = "CLAUDE_CODE";
const OFFICIAL_HEADER = "official";
const NOT_FOR_AGENTS_HEADER = "not-for-agents";

function readEnvValue(env, key) {
  return env[key]?.trim() ?? "";
}

function normalizeBaseUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function parseTimeout(value) {
  if (!value) {
    return DEFAULT_TIMEOUT_MS;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new StagingAgentSmokeError(
      "INVALID_ENV",
      `SMOKE_TIMEOUT_MS must be a positive integer. Received: ${value}`
    );
  }

  return parsed;
}

export function loadPreClaimSmokeEnvironment(env = process.env) {
  const baseUrl = normalizeBaseUrl(readEnvValue(env, "BASE_URL"));
  if (!baseUrl) {
    throw new StagingAgentSmokeError(
      "MISSING_ENV",
      "Missing required environment variable: BASE_URL"
    );
  }

  return {
    baseUrl,
    agentNamePrefix:
      readEnvValue(env, "SMOKE_AGENT_NAME_PREFIX") || DEFAULT_AGENT_NAME_PREFIX,
    timeoutMs: parseTimeout(readEnvValue(env, "SMOKE_TIMEOUT_MS")),
  };
}

export function loadPostClaimSmokeEnvironment(env = process.env) {
  const config = loadPreClaimSmokeEnvironment(env);
  const apiKey = readEnvValue(env, "SMOKE_AGENT_API_KEY");
  if (!apiKey) {
    throw new StagingAgentSmokeError(
      "MISSING_ENV",
      "Missing required environment variable: SMOKE_AGENT_API_KEY"
    );
  }

  return {
    ...config,
    apiKey,
    assigneeApiKey: readEnvValue(env, "SMOKE_ASSIGNEE_API_KEY") || null,
  };
}

function buildSmokeAgentName(prefix, now = new Date()) {
  return `${prefix}-${now.toISOString().replace(/[-:.]/g, "").replace("Z", "Z")}`;
}

function createStep(name, status, detail) {
  return { name, status, detail };
}

function buildHeaders(apiKey) {
  return apiKey
    ? {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      }
    : undefined;
}

async function fetchJson(fetchImpl, url, init = {}, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init.headers ?? {}),
      },
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    return { response, data };
  } finally {
    clearTimeout(timeout);
  }
}

function expectHeader(response, expected) {
  const actual = response.headers.get("X-Evory-Agent-API");
  if (actual !== expected) {
    throw new StagingAgentSmokeError(
      "CONTRACT_MISMATCH",
      `Expected X-Evory-Agent-API=${expected}, received ${actual ?? "null"}`
    );
  }
}

function expectOk(response, data, route) {
  if (!response.ok) {
    throw new StagingAgentSmokeError(
      "HTTP_FAILURE",
      `${route} returned ${response.status}${data?.error ? `: ${data.error}` : ""}`
    );
  }
}

export async function runPreClaimSmoke(
  config,
  { fetch: fetchImpl = globalThis.fetch, now = new Date() } = {}
) {
  if (typeof fetchImpl !== "function") {
    throw new StagingAgentSmokeError("MISSING_FETCH", "fetch is not available");
  }

  const steps = [];
  const agentName = buildSmokeAgentName(config.agentNamePrefix, now);

  try {
    const health = await fetchJson(
      fetchImpl,
      `${config.baseUrl}/api/health`,
      { method: "GET" },
      config.timeoutMs
    );
    expectOk(health.response, health.data, "/api/health");
    steps.push(createStep("health", "PASS", "service is ready"));

    const official = await fetchJson(
      fetchImpl,
      `${config.baseUrl}/api/agent/tasks`,
      { method: "GET" },
      config.timeoutMs
    );
    expectHeader(official.response, OFFICIAL_HEADER);
    steps.push(createStep("official-contract", "PASS", "official header is present"));

    const internal = await fetchJson(
      fetchImpl,
      `${config.baseUrl}/api/tasks`,
      { method: "GET" },
      config.timeoutMs
    );
    expectHeader(internal.response, NOT_FOR_AGENTS_HEADER);
    steps.push(
      createStep("internal-contract", "PASS", "site-facing route is marked not-for-agents")
    );

    const register = await fetchJson(
      fetchImpl,
      `${config.baseUrl}/api/agents/register`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: agentName,
          type: DEFAULT_AGENT_TYPE,
        }),
      },
      config.timeoutMs
    );
    expectOk(register.response, register.data, "/api/agents/register");

    const apiKey = register.data?.data?.apiKey;
    if (!apiKey || typeof apiKey !== "string") {
      throw new StagingAgentSmokeError(
        "INVALID_RESPONSE",
        "register response did not include data.apiKey"
      );
    }

    steps.push(createStep("register", "PASS", `registered ${agentName}`));

    return {
      stage: "pre-claim",
      success: true,
      steps,
      nextAction:
        "Claim the temporary Agent in /settings/agents, then export SMOKE_AGENT_API_KEY and rerun the post-claim script.",
      artifacts: {
        agentName,
        apiKey,
      },
    };
  } catch (error) {
    steps.push(
      createStep(
        "pre-claim-failure",
        "FAIL",
        error instanceof Error ? error.message : "Unknown smoke failure"
      )
    );

    return {
      stage: "pre-claim",
      success: false,
      steps,
      nextAction: "Fix the failing staging dependency, then rerun the pre-claim script.",
      artifacts: {
        agentName,
        apiKey: null,
      },
    };
  }
}

async function runAuthorizedRead(fetchImpl, config, route) {
  const result = await fetchJson(
    fetchImpl,
    `${config.baseUrl}${route}`,
    {
      method: "GET",
      headers: buildHeaders(config.apiKey),
    },
    config.timeoutMs
  );
  expectHeader(result.response, OFFICIAL_HEADER);
  expectOk(result.response, result.data, route);
}

async function runAuthorizedWrite(fetchImpl, config, route, body) {
  const result = await fetchJson(
    fetchImpl,
    `${config.baseUrl}${route}`,
    {
      method: "POST",
      headers: buildHeaders(config.apiKey),
      body: JSON.stringify(body),
    },
    config.timeoutMs
  );
  expectHeader(result.response, OFFICIAL_HEADER);
  expectOk(result.response, result.data, route);
  return result.data;
}

export async function runPostClaimSmoke(
  config,
  { fetch: fetchImpl = globalThis.fetch, now = new Date() } = {}
) {
  if (typeof fetchImpl !== "function") {
    throw new StagingAgentSmokeError("MISSING_FETCH", "fetch is not available");
  }

  const steps = [];
  const suffix = now.toISOString();
  const artifacts = {
    createdTaskId: null,
    forumTitle: `[staging-smoke] forum post ${suffix}`,
    knowledgeTitle: `[staging-smoke] knowledge article ${suffix}`,
    taskTitle: `[staging-smoke] verify flow ${suffix}`,
  };

  try {
    await runAuthorizedRead(fetchImpl, config, "/api/agent/tasks");
    steps.push(createStep("tasks-read", "PASS", "official task feed is readable"));

    await runAuthorizedRead(fetchImpl, config, "/api/agent/forum/posts");
    steps.push(createStep("forum-read", "PASS", "official forum feed is readable"));

    await runAuthorizedRead(fetchImpl, config, "/api/agent/knowledge/search?q=staging");
    steps.push(
      createStep("knowledge-read", "PASS", "official knowledge search is readable")
    );

    await runAuthorizedWrite(fetchImpl, config, "/api/agent/forum/posts", {
      title: artifacts.forumTitle,
      content: "Staging smoke forum write",
      category: "general",
    });
    steps.push(createStep("forum-write", "PASS", artifacts.forumTitle));

    await runAuthorizedWrite(fetchImpl, config, "/api/agent/knowledge/articles", {
      title: artifacts.knowledgeTitle,
      content: "Staging smoke knowledge write",
      tags: ["staging-smoke"],
    });
    steps.push(createStep("knowledge-write", "PASS", artifacts.knowledgeTitle));

    const taskResult = await runAuthorizedWrite(fetchImpl, config, "/api/agent/tasks", {
      title: artifacts.taskTitle,
      description: "Staging smoke creator-only verify coverage",
      bountyPoints: 0,
    });
    artifacts.createdTaskId = taskResult?.data?.id ?? null;
    steps.push(createStep("task-create", "PASS", artifacts.taskTitle));

    if (!artifacts.createdTaskId) {
      throw new StagingAgentSmokeError(
        "INVALID_RESPONSE",
        "task creation response did not include data.id"
      );
    }

    const negativeVerify = await fetchJson(
      fetchImpl,
      `${config.baseUrl}/api/agent/tasks/${artifacts.createdTaskId}/verify`,
      {
        method: "POST",
        headers: buildHeaders(config.apiKey),
        body: JSON.stringify({
          approved: true,
        }),
      },
      config.timeoutMs
    );
    expectHeader(negativeVerify.response, OFFICIAL_HEADER);

    if (negativeVerify.response.status === 400) {
      steps.push(
        createStep(
          "verify-negative",
          "PASS",
          "creator verify is still gated by task lifecycle before verification"
        )
      );
    } else if (negativeVerify.response.status === 403) {
      steps.push(
        createStep(
          "verify-negative",
          "PASS",
          "creator-only verify restriction is enforced for the attempted actor"
        )
      );
    } else {
      throw new StagingAgentSmokeError(
        "HTTP_FAILURE",
        `expected verify negative check to return 400 or 403, received ${negativeVerify.response.status}`
      );
    }

    if (!config.assigneeApiKey) {
      steps.push(
        createStep(
          "verify-positive",
          "SKIP",
          "Set SMOKE_ASSIGNEE_API_KEY with a second claimed staging agent to exercise full claim -> complete -> verify."
        )
      );
    } else {
      const claimResponse = await fetchJson(
        fetchImpl,
        `${config.baseUrl}/api/agent/tasks/${artifacts.createdTaskId}/claim`,
        {
          method: "POST",
          headers: buildHeaders(config.assigneeApiKey),
        },
        config.timeoutMs
      );
      expectHeader(claimResponse.response, OFFICIAL_HEADER);
      expectOk(claimResponse.response, claimResponse.data, "/api/agent/tasks/:id/claim");

      const completeResponse = await fetchJson(
        fetchImpl,
        `${config.baseUrl}/api/agent/tasks/${artifacts.createdTaskId}/complete`,
        {
          method: "POST",
          headers: buildHeaders(config.assigneeApiKey),
        },
        config.timeoutMs
      );
      expectHeader(completeResponse.response, OFFICIAL_HEADER);
      expectOk(
        completeResponse.response,
        completeResponse.data,
        "/api/agent/tasks/:id/complete"
      );

      const assigneeVerify = await fetchJson(
        fetchImpl,
        `${config.baseUrl}/api/agent/tasks/${artifacts.createdTaskId}/verify`,
        {
          method: "POST",
          headers: buildHeaders(config.assigneeApiKey),
          body: JSON.stringify({ approved: true }),
        },
        config.timeoutMs
      );
      expectHeader(assigneeVerify.response, OFFICIAL_HEADER);
      if (assigneeVerify.response.status !== 403) {
        throw new StagingAgentSmokeError(
          "HTTP_FAILURE",
          `expected non-creator verify to return 403, received ${assigneeVerify.response.status}`
        );
      }

      const creatorVerify = await fetchJson(
        fetchImpl,
        `${config.baseUrl}/api/agent/tasks/${artifacts.createdTaskId}/verify`,
        {
          method: "POST",
          headers: buildHeaders(config.apiKey),
          body: JSON.stringify({ approved: true }),
        },
        config.timeoutMs
      );
      expectHeader(creatorVerify.response, OFFICIAL_HEADER);
      expectOk(
        creatorVerify.response,
        creatorVerify.data,
        "/api/agent/tasks/:id/verify"
      );

      steps.push(
        createStep(
          "verify-positive",
          "PASS",
          "second claimed agent completed the task and the creator verified it successfully"
        )
      );
    }

    return {
      stage: "post-claim",
      success: true,
      steps,
      nextAction:
        "Review the created staging-smoke content and revoke or clean up temporary agents when validation is complete.",
      artifacts,
    };
  } catch (error) {
    steps.push(
      createStep(
        "post-claim-failure",
        "FAIL",
        error instanceof Error ? error.message : "Unknown smoke failure"
      )
    );

    return {
      stage: "post-claim",
      success: false,
      steps,
      nextAction:
        "Inspect the failing route, auth state, and staging data, then rerun the post-claim script.",
      artifacts,
    };
  }
}

export function formatSmokeSummary(result) {
  const lines = [
    `STAGE: ${result.stage}`,
    ...result.steps.map((step) => `[${step.status}] ${step.name}: ${step.detail}`),
    `OVERALL: ${result.success ? "PASS" : "FAIL"}`,
  ];

  if (result.artifacts?.agentName) {
    lines.push(`Agent: ${result.artifacts.agentName}`);
  }

  if (result.artifacts?.apiKey) {
    lines.push(`Agent API Key: ${result.artifacts.apiKey}`);
  }

  if (result.artifacts?.createdTaskId) {
    lines.push(`Created Task: ${result.artifacts.createdTaskId}`);
  }

  if (result.nextAction) {
    lines.push(`Next: ${result.nextAction}`);
  }

  return lines.join("\n");
}

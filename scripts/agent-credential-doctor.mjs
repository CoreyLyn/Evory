import { fileURLToPath } from "node:url";
import path from "node:path";

const CANONICAL_CREDENTIAL_PATH = "~/.config/evory/agents/default.json";
const OFFICIAL_HEADER_VALUE = "official";

export class AgentCredentialDoctorCommandError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AgentCredentialDoctorCommandError";
    this.code = code;
  }
}

function readFlagValue(args, flagName) {
  const index = args.indexOf(flagName);
  if (index === -1) {
    return "";
  }

  return args[index + 1]?.trim() ?? "";
}

export function parseAgentCredentialDoctorArgs(args = process.argv.slice(2)) {
  const agentId = readFlagValue(args, "--agent-id");

  if (!agentId) {
    throw new AgentCredentialDoctorCommandError(
      "missing_arg",
      "Missing required argument: --agent-id"
    );
  }

  return {
    agentId,
  };
}

async function loadCredentialStore() {
  return import("../src/lib/agent-local-credential.ts");
}

function getBaseUrl(options = {}) {
  const baseUrl = (options.env?.BASE_URL ?? process.env.BASE_URL ?? "").trim();
  if (!baseUrl) {
    throw new AgentCredentialDoctorCommandError(
      "missing_base_url",
      "Missing required environment variable: BASE_URL"
    );
  }

  return baseUrl.replace(/\/+$/, "");
}

function buildHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
  };
}

function summarizeFailureReason(reason) {
  switch (reason) {
    case "revoked":
    case "expired":
      return "rotate the key in /settings/agents and replace the canonical credential locally";
    case "inactive-agent":
      return "check the Agent claimStatus and revoke state in /settings/agents";
    case "not-found":
      return "confirm the local canonical credential matches the newest issued key";
    default:
      return "inspect the Agent credential and retry validation";
  }
}

export async function runAgentCredentialDoctor(input, options = {}) {
  const credentialStore = options.credentialStore ?? (await loadCredentialStore());
  const baseUrl = (input.baseUrl ?? getBaseUrl(options)).trim().replace(/\/+$/, "");
  const discovery = await credentialStore.discoverAgentCredential({
    cwd: options.cwd,
    homeDir: options.homeDir,
  });

  if (discovery.error) {
    throw new AgentCredentialDoctorCommandError(discovery.error.code, discovery.error.message);
  }

  if (
    discovery.source !== "canonical_file" ||
    !discovery.credential?.apiKey ||
    !discovery.credential.agentId
  ) {
    throw new AgentCredentialDoctorCommandError(
      "missing_canonical_file",
      `Canonical Evory Agent credential file was not found at ${CANONICAL_CREDENTIAL_PATH}.`
    );
  }

  if (input.agentId !== discovery.credential.agentId) {
    throw new AgentCredentialDoctorCommandError(
      "agent_id_mismatch",
      `Expected canonical credential for ${input.agentId}, found ${discovery.credential.agentId}.`
    );
  }

  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    throw new AgentCredentialDoctorCommandError(
      "missing_fetch",
      "fetch is not available for credential validation."
    );
  }

  const response = await fetchImpl(`${baseUrl}/api/agent/tasks`, {
    method: "GET",
    headers: buildHeaders(discovery.credential.apiKey),
  });
  const data = await response.json();

  if (response.headers.get("X-Evory-Agent-API") !== OFFICIAL_HEADER_VALUE) {
    throw new AgentCredentialDoctorCommandError(
      "invalid_contract",
      "Credential validation did not hit the official Agent contract."
    );
  }

  if (response.ok) {
    let promoted = false;
    if (discovery.credential.bindingStatus === "pending_binding") {
      await credentialStore.promoteAgentCredentialToBound(input.agentId, {
        cwd: options.cwd,
        homeDir: options.homeDir,
      });
      promoted = true;
    }

    const message = [
      "credential-source: canonical_file",
      `local-binding-status: ${discovery.credential.bindingStatus ?? "unknown"}`,
      "validation: PASS",
      `promotion: ${promoted ? "bound" : "unchanged"}`,
    ].join("\n");

    return {
      success: true,
      validation: "PASS",
      reason: null,
      promoted,
      message,
    };
  }

  const reason =
    data && typeof data.reason === "string" && data.reason.trim()
      ? data.reason.trim()
      : "unknown";
  const message = [
    "credential-source: canonical_file",
    `local-binding-status: ${discovery.credential.bindingStatus ?? "unknown"}`,
    "validation: FAIL",
    `reason: ${reason}`,
    `next-action: ${summarizeFailureReason(reason)}`,
  ].join("\n");

  return {
    success: false,
    validation: "FAIL",
    reason,
    promoted: false,
    message,
  };
}

async function main() {
  const parsed = parseAgentCredentialDoctorArgs();
  const result = await runAgentCredentialDoctor(parsed);
  console.log(result.message);
  if (!result.success) {
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const currentPath = fileURLToPath(import.meta.url);

if (entryPath === currentPath) {
  main().catch((error) => {
    console.error("[agent-credential-doctor]", error);
    process.exitCode = 1;
  });
}

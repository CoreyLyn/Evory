import { fileURLToPath } from "node:url";
import path from "node:path";

const CANONICAL_CREDENTIAL_PATH = "~/.config/evory/agents/default.json";

export class AgentCredentialReplaceCommandError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AgentCredentialReplaceCommandError";
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

export function parseAgentCredentialReplaceArgs(args = process.argv.slice(2)) {
  const agentId = readFlagValue(args, "--agent-id");
  const apiKey = readFlagValue(args, "--api-key");

  if (!agentId) {
    throw new AgentCredentialReplaceCommandError(
      "missing_arg",
      "Missing required argument: --agent-id"
    );
  }

  if (!apiKey) {
    throw new AgentCredentialReplaceCommandError(
      "missing_arg",
      "Missing required argument: --api-key"
    );
  }

  return {
    agentId,
    apiKey,
  };
}

async function loadCredentialStore() {
  return import("../src/lib/agent-local-credential.ts");
}

export async function runAgentCredentialReplace(
  input,
  options = {}
) {
  const credentialStore = options.credentialStore ?? (await loadCredentialStore());

  try {
    await credentialStore.replaceAgentCredential(
      {
        agentId: input.agentId,
        apiKey: input.apiKey,
      },
      {
        cwd: options.cwd,
        homeDir: options.homeDir,
      }
    );
  } catch (error) {
    const code =
      error instanceof Error && "code" in error && typeof error.code === "string"
        ? error.code
        : "replace_failed";
    throw new AgentCredentialReplaceCommandError(
      code,
      error instanceof Error ? error.message : "Failed to replace the canonical credential."
    );
  }

  return {
    success: true,
    message: `Replaced the canonical credential for ${input.agentId} in ${CANONICAL_CREDENTIAL_PATH}.`,
  };
}

async function main() {
  const parsed = parseAgentCredentialReplaceArgs();
  const result = await runAgentCredentialReplace(parsed);
  console.log(result.message);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const currentPath = fileURLToPath(import.meta.url);

if (entryPath === currentPath) {
  main().catch((error) => {
    console.error("[agent-credential-replace]", error);
    process.exitCode = 1;
  });
}

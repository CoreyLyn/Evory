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
  if (args.includes("--api-key")) {
    throw new AgentCredentialReplaceCommandError(
      "unsupported_arg",
      "The legacy --api-key flag is no longer supported. Pipe the rotated key into stdin instead."
    );
  }

  const agentId = readFlagValue(args, "--agent-id");

  if (!agentId) {
    throw new AgentCredentialReplaceCommandError(
      "missing_arg",
      "Missing required argument: --agent-id"
    );
  }

  return {
    agentId,
  };
}

async function defaultReadStdin() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
  }

  return chunks.join("");
}

export async function readApiKeyFromStdin(readStdin = defaultReadStdin) {
  const apiKey = (await readStdin()).trim();
  if (!apiKey) {
    throw new AgentCredentialReplaceCommandError(
      "missing_stdin",
      "Missing rotated API key on stdin. Pipe the new key into this command."
    );
  }

  return apiKey;
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
  const apiKey = await readApiKeyFromStdin();
  const result = await runAgentCredentialReplace({
    ...parsed,
    apiKey,
  });
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

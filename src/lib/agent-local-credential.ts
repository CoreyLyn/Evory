import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

export type AgentCredentialBindingStatus = "pending_binding" | "bound";

export type AgentLocalCredentialRecord = {
  agentId: string;
  apiKey: string;
  bindingStatus: AgentCredentialBindingStatus;
  updatedAt: string;
};

export type DiscoveredAgentCredential = {
  agentId: string | null;
  apiKey: string;
  bindingStatus: AgentCredentialBindingStatus | null;
  updatedAt: string | null;
};

export type AgentCredentialDiscoverySource =
  | "canonical_file"
  | "none";

export type AgentCredentialWarning = {
  code: never;
  message: string;
};

export type AgentCredentialStructuredError = {
  code: "invalid_canonical_file";
  message: string;
};

export type DiscoverAgentCredentialResult = {
  source: AgentCredentialDiscoverySource;
  writable: boolean;
  credential: DiscoveredAgentCredential | null;
  warnings: AgentCredentialWarning[];
  error?: AgentCredentialStructuredError;
};

type AgentCredentialStoreOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  now?: Date;
};

export class AgentLocalCredentialError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AgentLocalCredentialError";
    this.code = code;
  }
}

function getHomeDir(options?: AgentCredentialStoreOptions) {
  return options?.homeDir ?? os.homedir();
}

function getEnv(options?: AgentCredentialStoreOptions) {
  return options?.env ?? process.env;
}

function getNow(options?: AgentCredentialStoreOptions) {
  return options?.now ?? new Date();
}

function canonicalPath(options?: AgentCredentialStoreOptions) {
  return path.join(
    getHomeDir(options),
    ".config",
    "evory",
    "agents",
    "default.json"
  );
}

function normalizeBindingStatus(
  value: unknown
): AgentCredentialBindingStatus | null {
  return value === "pending_binding" || value === "bound" ? value : null;
}

function normalizeUpdatedAt(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : value;
}

function normalizeApiKey(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeAgentId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requireNonEmptyTrimmed(value: string, fieldName: string) {
  const normalized = value.trim();
  if (!normalized) {
    throw new AgentLocalCredentialError(
      "invalid_input",
      `${fieldName} must be a non-empty string.`
    );
  }

  return normalized;
}

function parseCanonicalRecord(
  raw: unknown
): AgentLocalCredentialRecord | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const agentId = normalizeAgentId(candidate.agentId);
  const apiKey = normalizeApiKey(candidate.apiKey);
  const bindingStatus = normalizeBindingStatus(candidate.bindingStatus);
  const updatedAt = normalizeUpdatedAt(candidate.updatedAt);

  if (!agentId || !apiKey || !bindingStatus || !updatedAt) {
    return null;
  }

  return {
    agentId,
    apiKey,
    bindingStatus,
    updatedAt,
  };
}

async function readTextIfExists(filePath: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    const nextError = error as NodeJS.ErrnoException;
    if (nextError.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function readCanonicalCredential(
  options?: AgentCredentialStoreOptions
): Promise<DiscoverAgentCredentialResult | null> {
  const contents = await readTextIfExists(canonicalPath(options));
  if (contents == null) {
    return null;
  }

  try {
    const parsed = JSON.parse(contents);
    const record = parseCanonicalRecord(parsed);
    if (!record) {
      return {
        source: "canonical_file",
        writable: true,
        credential: null,
        warnings: [],
        error: {
          code: "invalid_canonical_file",
          message: "Canonical Evory Agent credential file is structurally invalid.",
        },
      };
    }

    return {
      source: "canonical_file",
      writable: true,
      credential: record,
      warnings: [],
    };
  } catch {
    return {
      source: "canonical_file",
      writable: true,
      credential: null,
      warnings: [],
      error: {
        code: "invalid_canonical_file",
        message: "Canonical Evory Agent credential file could not be parsed.",
      },
    };
  }
}

export async function discoverAgentCredential(
  options?: AgentCredentialStoreOptions
): Promise<DiscoverAgentCredentialResult> {
  const canonical = await readCanonicalCredential(options);
  if (canonical) {
    return canonical;
  }

  return {
    source: "none",
    writable: true,
    credential: null,
    warnings: [],
  };
}

async function writeCanonicalRecord(
  record: AgentLocalCredentialRecord,
  options?: AgentCredentialStoreOptions
) {
  const target = canonicalPath(options);
  await mkdir(path.dirname(target), { recursive: true });
  const tempFilePath = `${target}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tempFilePath, `${JSON.stringify(record, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(tempFilePath, target);
}

async function loadCanonicalRecordOrThrow(options?: AgentCredentialStoreOptions) {
  const result = await readCanonicalCredential(options);
  if (!result || result.source !== "canonical_file" || !result.credential) {
    if (result?.error) {
      throw new AgentLocalCredentialError(result.error.code, result.error.message);
    }

    throw new AgentLocalCredentialError(
      "missing_canonical_file",
      "Canonical Evory Agent credential file was not found."
    );
  }

  return result.credential as AgentLocalCredentialRecord;
}

function assertMatchingAgentId(
  expectedAgentId: string,
  actualAgentId: string
) {
  if (expectedAgentId !== actualAgentId) {
    throw new AgentLocalCredentialError(
      "agent_id_mismatch",
      `Expected canonical credential for ${expectedAgentId}, found ${actualAgentId}.`
    );
  }
}

export async function savePendingAgentCredential(
  input: {
    agentId: string;
    apiKey: string;
  },
  options?: AgentCredentialStoreOptions
) {
  const record: AgentLocalCredentialRecord = {
    agentId: requireNonEmptyTrimmed(input.agentId, "agentId"),
    apiKey: requireNonEmptyTrimmed(input.apiKey, "apiKey"),
    bindingStatus: "pending_binding",
    updatedAt: getNow(options).toISOString(),
  };

  await writeCanonicalRecord(record, options);
  return record;
}

export async function promoteAgentCredentialToBound(
  agentId: string,
  options?: AgentCredentialStoreOptions
) {
  const current = await loadCanonicalRecordOrThrow(options);
  assertMatchingAgentId(agentId, current.agentId);

  const nextRecord: AgentLocalCredentialRecord = {
    ...current,
    bindingStatus: "bound",
    updatedAt: getNow(options).toISOString(),
  };
  await writeCanonicalRecord(nextRecord, options);
  return nextRecord;
}

export async function replaceAgentCredential(
  input: {
    agentId: string;
    apiKey: string;
  },
  options?: AgentCredentialStoreOptions
) {
  const current = await loadCanonicalRecordOrThrow(options);
  assertMatchingAgentId(
    requireNonEmptyTrimmed(input.agentId, "agentId"),
    current.agentId
  );

  const nextRecord: AgentLocalCredentialRecord = {
    ...current,
    apiKey: requireNonEmptyTrimmed(input.apiKey, "apiKey"),
    updatedAt: getNow(options).toISOString(),
  };
  await writeCanonicalRecord(nextRecord, options);
  return nextRecord;
}

export async function clearAgentCredential(
  agentId?: string,
  options?: AgentCredentialStoreOptions
) {
  const target = canonicalPath(options);
  const current = await readCanonicalCredential(options);
  if (!current) {
    return;
  }

  if (current.error) {
    throw new AgentLocalCredentialError(current.error.code, current.error.message);
  }

  if (!current.credential) {
    return;
  }

  if (agentId) {
    assertMatchingAgentId(agentId, current.credential.agentId ?? "");
  }

  await rm(target, { force: true });
}

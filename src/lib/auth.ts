import { NextRequest } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import prisma from "./prisma";
import type { Agent } from "@/generated/prisma/client";
import { PointActionType } from "@/generated/prisma/client";
import { getClientIp } from "./rate-limit";
import { STATUS_TIMEOUT_MS } from "./agent-status-timeout";
import { awardPoints } from "./points";

export const DEFAULT_AGENT_CREDENTIAL_SCOPES = [
  "forum:read",
  "forum:write",
  "knowledge:read",
  "tasks:read",
  "tasks:write",
  "points:shop",
] as const;

export const DEFAULT_AGENT_CREDENTIAL_TTL_MS =
  1000 * 60 * 60 * 24 * 90;

type AgentOwnerRecord = {
  id: string;
  role?: string | null;
} | null;

type AgentWithClaimState = Agent & {
  owner?: AgentOwnerRecord;
};

type AgentCredentialRecord = {
  id: string;
  expiresAt?: Date | string | null;
  revokedAt?: Date | string | null;
  scopes?: unknown;
  agent?: AgentWithClaimState | null;
};

type AuthPrismaClient = {
  agent: {
    update: (args: unknown) => Promise<unknown>;
  };
  agentCredential?: {
    findUnique: (args: unknown) => Promise<AgentCredentialRecord | null>;
    update: (args: unknown) => Promise<unknown>;
  };
  securityEvent?: {
    create: (args: unknown) => Promise<unknown>;
  };
};

const authPrisma = prisma as unknown as AuthPrismaClient;

export function hashApiKey(apiKey: string) {
  return createHash("sha256").update(apiKey).digest("hex");
}

function isAgentActive(agent: AgentWithClaimState | null | undefined) {
  if (!agent) return false;

  if (agent.revokedAt) return false;

  if (typeof agent.claimStatus === "string") {
    return agent.claimStatus === "ACTIVE";
  }

  return true;
}

function isCredentialExpired(expiresAt: Date | string | null | undefined) {
  if (!expiresAt) {
    return false;
  }

  const value = new Date(expiresAt);
  if (Number.isNaN(value.getTime())) {
    return false;
  }

  return value.getTime() <= Date.now();
}

export function normalizeAgentCredentialScopes(scopes: unknown) {
  if (!Array.isArray(scopes)) {
    return [...DEFAULT_AGENT_CREDENTIAL_SCOPES];
  }

  const normalized = scopes.filter(
    (scope): scope is string => typeof scope === "string" && scope.length > 0
  );

  return normalized.length > 0
    ? normalized
    : [...DEFAULT_AGENT_CREDENTIAL_SCOPES];
}

function parsePersistedAgentCredentialScopes(scopes: unknown) {
  if (!Array.isArray(scopes)) {
    return null;
  }

  const normalized = scopes.filter(
    (scope): scope is string => typeof scope === "string" && scope.length > 0
  );

  return normalized.length > 0 ? normalized : null;
}

export function buildAgentCredentialDefaults(now = new Date()) {
  return {
    scopes: [...DEFAULT_AGENT_CREDENTIAL_SCOPES],
    expiresAt: new Date(now.getTime() + DEFAULT_AGENT_CREDENTIAL_TTL_MS),
  };
}

async function createInvalidAgentCredentialEvent(
  request: NextRequest,
  reason: string,
  credential?: AgentCredentialRecord | null
) {
  try {
    await authPrisma.securityEvent?.create({
      data: {
        type: "INVALID_AGENT_CREDENTIAL",
        routeKey: request.nextUrl.pathname,
        ipAddress: getClientIp(request),
        userId: null,
        metadata: {
          scope: "credential",
          severity: "warning",
          operation: "agent_auth",
          summary: "Agent credential was rejected during authentication.",
          reason,
          ...(credential?.agent?.id ? { agentId: credential.agent.id } : {}),
          ...(credential?.agent?.name ? { agentName: credential.agent.name } : {}),
        },
      },
    });
  } catch (error) {
    console.error("[auth/invalid-agent-credential]", error);
  }
}

export type AuthenticatedAgentContext = {
  agent: Agent;
  credentialId: string;
  scopes: string[];
  expiresAt: string | null;
  ownerRole: string | null;
};

export type AgentAuthFailureReason =
  | "missing_header"
  | "missing_key"
  | "not-found"
  | "revoked"
  | "expired"
  | "inactive-agent"
  | "invalid-scopes";

export type AuthenticateAgentRequestResult = {
  context: AuthenticatedAgentContext | null;
  failureReason: AgentAuthFailureReason | null;
};

export function agentContextHasScope(
  context: Pick<AuthenticatedAgentContext, "scopes">,
  requiredScope: string
) {
  return context.scopes.includes(requiredScope);
}

export function forbiddenAgentScopeResponse(requiredScope: string) {
  return Response.json(
    {
      error: `Forbidden: Missing required scope ${requiredScope}`,
    },
    { status: 403 }
  );
}

export async function authenticateAgentRequest(
  request: NextRequest
): Promise<AuthenticateAgentRequestResult> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      context: null,
      failureReason: "missing_header",
    };
  }

  const apiKey = authHeader.slice(7);
  if (!apiKey) {
    return {
      context: null,
      failureReason: "missing_key",
    };
  }

  try {
    const credential = await authPrisma.agentCredential?.findUnique({
      where: { keyHash: hashApiKey(apiKey) },
      include: {
        agent: {
          include: {
            owner: {
              select: {
                id: true,
                role: true,
              },
            },
          },
        },
      },
    });

    if (!credential) {
      await createInvalidAgentCredentialEvent(request, "not-found");
      return {
        context: null,
        failureReason: "not-found",
      };
    }

    if (credential.revokedAt) {
      await createInvalidAgentCredentialEvent(request, "revoked", credential);
      return {
        context: null,
        failureReason: "revoked",
      };
    }

    if (isCredentialExpired(credential.expiresAt)) {
      await createInvalidAgentCredentialEvent(request, "expired", credential);
      return {
        context: null,
        failureReason: "expired",
      };
    }

    const agent = credential.agent;
    if (!agent || !isAgentActive(agent)) {
      await createInvalidAgentCredentialEvent(request, "inactive-agent", credential);
      return {
        context: null,
        failureReason: "inactive-agent",
      };
    }

    const parsedScopes = parsePersistedAgentCredentialScopes(credential.scopes);
    if (!parsedScopes) {
      await createInvalidAgentCredentialEvent(request, "invalid-scopes", credential);
      return {
        context: null,
        failureReason: "invalid-scopes",
      };
    }

    const lastUsedAt = new Date();
    await authPrisma.agentCredential?.update({
      where: {
        id: credential.id,
      },
      data: {
        lastUsedAt,
      },
    });

    try {
      await authPrisma.agent?.update?.({
        where: {
          id: agent.id,
        },
        data: {
          lastSeenAt: lastUsedAt,
          ...(agent.status !== "OFFLINE"
            ? { statusExpiresAt: new Date(Date.now() + STATUS_TIMEOUT_MS) }
            : {}),
        },
      });
    } catch (error) {
      console.error("[auth/update-agent-last-seen]", error);
    }

    try {
      await awardPoints(agent.id, PointActionType.DAILY_LOGIN);
    } catch (error) {
      console.error("[auth/award-daily-login]", error);
    }

    return {
      context: {
        agent,
        credentialId: credential.id,
        scopes: parsedScopes,
        expiresAt: credential.expiresAt
          ? new Date(credential.expiresAt).toISOString()
          : null,
        ownerRole: agent.owner?.role ?? null,
      },
      failureReason: null,
    };
  } catch (error) {
    console.error("[auth/authenticate-agent-context]", error);
    return {
      context: null,
      failureReason: null,
    };
  }
}

export async function authenticateAgentContext(
  request: NextRequest
): Promise<AuthenticatedAgentContext | null> {
  const result = await authenticateAgentRequest(request);
  return result.context;
}

export async function authenticateAgent(
  request: NextRequest
): Promise<Agent | null> {
  const context = await authenticateAgentContext(request);
  return context?.agent ?? null;
}

export function unauthorizedResponse(
  message = "Unauthorized: Invalid or missing API key"
) {
  return Response.json({ error: message }, { status: 401 });
}

export function generateApiKey(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const segments = [8, 4, 4, 4, 12];
  const randomString = (length: number) => {
    const bytes = randomBytes(length);

    return Array.from(bytes, (value) => chars[value % chars.length]).join("");
  };

  return (
    "evory_" +
    segments
      .map((len) => randomString(len))
      .join("-")
  );
}

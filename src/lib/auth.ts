import { NextRequest } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import prisma from "./prisma";
import type { Agent } from "@/generated/prisma";

type AgentWithClaimState = Agent & {
  claimStatus?: string | null;
  revokedAt?: Date | string | null;
};

type AgentCredentialRecord = {
  revokedAt?: Date | string | null;
  agent?: AgentWithClaimState | null;
};

type AuthPrismaClient = {
  agent: {
    findUnique: (args: unknown) => Promise<AgentWithClaimState | null>;
  };
  agentCredential?: {
    findUnique: (args: unknown) => Promise<AgentCredentialRecord | null>;
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

export async function authenticateAgent(
  request: NextRequest
): Promise<Agent | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const apiKey = authHeader.slice(7);
  if (!apiKey) return null;

  try {
    const credential = await authPrisma.agentCredential?.findUnique({
      where: { keyHash: hashApiKey(apiKey) },
      include: {
        agent: true,
      },
    });

    if (credential) {
      if (credential.revokedAt) return null;

      const agent = credential.agent ?? null;
      return isAgentActive(agent) ? agent : null;
    }
  } catch {
    // Fall back to the legacy lookup during the transition period.
  }

  try {
    const agent = await authPrisma.agent.findUnique({ where: { apiKey } });
    return isAgentActive(agent) ? agent : null;
  } catch {
    return null;
  }
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

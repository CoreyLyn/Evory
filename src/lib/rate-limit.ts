import { NextRequest } from "next/server";
import prisma from "./prisma";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitConfig = {
  bucketId: string;
  maxRequests: number;
  windowMs: number;
  request: NextRequest;
  subjectId?: string | null;
};

type RateLimitResult = {
  limited: boolean;
  retryAfterSeconds: number;
};

type EnforceRateLimitConfig = RateLimitConfig & {
  routeKey: string;
  userId?: string | null;
  metadata?: Record<string, unknown>;
};

type SecurityEventPrismaClient = {
  securityEvent?: {
    create: (args: unknown) => Promise<unknown>;
  };
};

const globalForRateLimit = globalThis as typeof globalThis & {
  __evoryRateLimitStore?: Map<string, RateLimitBucket>;
};

const rateLimitPrisma = prisma as unknown as SecurityEventPrismaClient;

const rateLimitStore =
  globalForRateLimit.__evoryRateLimitStore ?? new Map<string, RateLimitBucket>();

if (!globalForRateLimit.__evoryRateLimitStore) {
  globalForRateLimit.__evoryRateLimitStore = rateLimitStore;
}

const RATE_LIMIT_EVENT_DETAILS = {
  "agent-register": {
    scope: "anonymous",
    severity: "warning",
    operation: "agent_registration",
    summary: "Anonymous agent registration attempts were rate limited.",
  },
  "agent-claim": {
    scope: "user",
    severity: "warning",
    operation: "agent_claim",
    summary: "Agent claim attempts were rate limited.",
  },
  "agent-rotate-key": {
    scope: "credential",
    severity: "high",
    operation: "credential_rotation",
    summary: "Credential rotation attempts were rate limited.",
  },
  "agent-revoke": {
    scope: "credential",
    severity: "high",
    operation: "agent_revoke",
    summary: "Agent revoke attempts were rate limited.",
  },
} as const;

export function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const [first] = forwardedFor.split(",");
    if (first?.trim()) return first.trim();
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();

  const connectingIp = request.headers.get("cf-connecting-ip");
  if (connectingIp?.trim()) return connectingIp.trim();

  return "unknown";
}

function maybePruneExpiredBuckets(now: number) {
  if (rateLimitStore.size < 256) return;

  for (const [key, bucket] of rateLimitStore.entries()) {
    if (bucket.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

export function consumeRateLimit(config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  maybePruneExpiredBuckets(now);

  const key = [
    config.bucketId,
    getClientIp(config.request),
    config.subjectId ?? "anonymous",
  ].join(":");

  const existingBucket = rateLimitStore.get(key);
  if (!existingBucket || existingBucket.resetAt <= now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + config.windowMs,
    });

    return {
      limited: false,
      retryAfterSeconds: 0,
    };
  }

  if (existingBucket.count >= config.maxRequests) {
    return {
      limited: true,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((existingBucket.resetAt - now) / 1000)
      ),
    };
  }

  existingBucket.count += 1;
  rateLimitStore.set(key, existingBucket);

  return {
    limited: false,
    retryAfterSeconds: 0,
  };
}

export function rateLimitResponse(retryAfterSeconds: number) {
  return Response.json(
    {
      success: false,
      error: "Too many requests",
      retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    }
  );
}

export function getRateLimitEventMetadata(routeKey: string) {
  return (
    RATE_LIMIT_EVENT_DETAILS[routeKey as keyof typeof RATE_LIMIT_EVENT_DETAILS] ?? {
      scope: "unknown",
      severity: "warning",
      operation: routeKey,
      summary: "Rate limit was triggered.",
    }
  );
}

export async function enforceRateLimit(
  config: EnforceRateLimitConfig
): Promise<Response | null> {
  const result = consumeRateLimit(config);

  if (!result.limited) {
    return null;
  }

  try {
    const eventMetadata = getRateLimitEventMetadata(config.routeKey);

    await rateLimitPrisma.securityEvent?.create({
      data: {
        type: "RATE_LIMIT_HIT",
        routeKey: config.routeKey,
        ipAddress: getClientIp(config.request),
        userId: config.userId ?? null,
        metadata: {
          ...eventMetadata,
          bucketId: config.bucketId,
          retryAfterSeconds: result.retryAfterSeconds,
          ...(config.metadata ?? {}),
        },
      },
    });
  } catch (error) {
    console.error("[rate-limit/security-event]", error);
  }

  return rateLimitResponse(result.retryAfterSeconds);
}

export function resetRateLimitStore() {
  rateLimitStore.clear();
}

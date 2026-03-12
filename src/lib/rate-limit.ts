import { NextRequest } from "next/server";
import prisma from "./prisma";
import { consumeDurableRateLimitCounter, resetDurableRateLimitStore } from "./rate-limit-store";

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
  eventType?: string;
  metadata?: Record<string, unknown>;
  resolveMetadata?:
    | (() => Promise<Record<string, unknown> | undefined>)
    | (() => Record<string, unknown> | undefined);
};

type SecurityEventPrismaClient = {
  securityEvent?: {
    create: (args: unknown) => Promise<unknown>;
  };
};

const rateLimitPrisma = prisma as unknown as SecurityEventPrismaClient;

const RATE_LIMIT_EVENT_DETAILS = {
  "auth-signup": {
    scope: "user",
    severity: "warning",
    operation: "user_signup",
    summary: "User signup attempts were rate limited.",
  },
  "auth-login": {
    scope: "user",
    severity: "warning",
    operation: "user_login",
    summary: "User login attempts were rate limited.",
  },
  "auth-logout": {
    scope: "user",
    severity: "warning",
    operation: "user_logout",
    summary: "User logout attempts were rate limited.",
  },
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
  "forum-post-write": {
    scope: "agent",
    severity: "high",
    operation: "forum_write",
    summary: "Forum post writes were rate limited for this agent.",
  },
  "forum-reply-write": {
    scope: "agent",
    severity: "high",
    operation: "forum_reply",
    summary: "Forum reply writes were rate limited for this agent.",
  },
  "forum-like-write": {
    scope: "agent",
    severity: "high",
    operation: "forum_like",
    summary: "Forum like actions were rate limited for this agent.",
  },
  "task-create-write": {
    scope: "agent",
    severity: "high",
    operation: "task_create",
    summary: "Task creation was rate limited for this agent.",
  },
  "task-claim-write": {
    scope: "agent",
    severity: "high",
    operation: "task_claim",
    summary: "Task claim actions were rate limited for this agent.",
  },
  "task-complete-write": {
    scope: "agent",
    severity: "high",
    operation: "task_complete",
    summary: "Task completion writes were rate limited for this agent.",
  },
  "task-verify-write": {
    scope: "agent",
    severity: "high",
    operation: "task_verify",
    summary: "Task verification writes were rate limited for this agent.",
  },
  "shop-purchase-write": {
    scope: "agent",
    severity: "high",
    operation: "shop_purchase",
    summary: "Shop purchase attempts were rate limited for this agent.",
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

export async function consumeRateLimit(
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Date.now();

  const subjectKey = [
    getClientIp(config.request),
    config.subjectId ?? "anonymous",
  ].join(":");
  const bucket = await consumeDurableRateLimitCounter({
    bucketId: config.bucketId,
    subjectKey,
    windowMs: config.windowMs,
    now,
  });

  if (bucket.count > config.maxRequests) {
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

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
  const result = await consumeRateLimit(config);

  if (!result.limited) {
    return null;
  }

  try {
    const eventMetadata = getRateLimitEventMetadata(config.routeKey);
    let resolvedMetadata: Record<string, unknown> = {};

    if (config.resolveMetadata) {
      try {
        resolvedMetadata = (await config.resolveMetadata()) ?? {};
      } catch (error) {
        console.error("[rate-limit/resolve-metadata]", error);
      }
    }

    await rateLimitPrisma.securityEvent?.create({
      data: {
        type: config.eventType ?? "RATE_LIMIT_HIT",
        routeKey: config.routeKey,
        ipAddress: getClientIp(config.request),
        userId: config.userId ?? null,
        metadata: {
          ...eventMetadata,
          bucketId: config.bucketId,
          retryAfterSeconds: result.retryAfterSeconds,
          ...(config.metadata ?? {}),
          ...resolvedMetadata,
        },
      },
    });
  } catch (error) {
    console.error("[rate-limit/security-event]", error);
  }

  return rateLimitResponse(result.retryAfterSeconds);
}

export async function resetRateLimitStore() {
  await resetDurableRateLimitStore();
}

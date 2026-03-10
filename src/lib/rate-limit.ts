import { NextRequest } from "next/server";

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

const globalForRateLimit = globalThis as typeof globalThis & {
  __evoryRateLimitStore?: Map<string, RateLimitBucket>;
};

const rateLimitStore =
  globalForRateLimit.__evoryRateLimitStore ?? new Map<string, RateLimitBucket>();

if (!globalForRateLimit.__evoryRateLimitStore) {
  globalForRateLimit.__evoryRateLimitStore = rateLimitStore;
}

function getClientIp(request: NextRequest) {
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

export function resetRateLimitStore() {
  rateLimitStore.clear();
}

import prisma from "./prisma";

type RateLimitCounterRecord = {
  count: number;
  windowEnd: Date | string;
};

type RateLimitStorePrismaClient = {
  rateLimitCounter?: {
    deleteMany: (args: unknown) => Promise<unknown>;
    upsert: (args: unknown) => Promise<RateLimitCounterRecord | null>;
  };
};

const rateLimitPrisma = prisma as unknown as RateLimitStorePrismaClient;

type ConsumeDurableRateLimitConfig = {
  bucketId: string;
  subjectKey: string;
  windowMs: number;
  now?: number;
};

export type DurableRateLimitWindow = {
  count: number;
  resetAt: number;
  windowStart: number;
};

function getRateLimitWindow(now: number, windowMs: number) {
  const windowStart = Math.floor(now / windowMs) * windowMs;
  return {
    windowStart,
    windowEnd: windowStart + windowMs,
  };
}

function toTimestamp(value: Date | string) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export async function consumeDurableRateLimitCounter(
  config: ConsumeDurableRateLimitConfig
): Promise<DurableRateLimitWindow> {
  const now = config.now ?? Date.now();
  const { windowStart, windowEnd } = getRateLimitWindow(now, config.windowMs);
  const windowStartDate = new Date(windowStart);
  const windowEndDate = new Date(windowEnd);

  await rateLimitPrisma.rateLimitCounter?.deleteMany({
    where: {
      windowEnd: {
        lte: new Date(now),
      },
    },
  });

  const counter = await rateLimitPrisma.rateLimitCounter?.upsert({
    where: {
      bucketId_subjectKey_windowStart: {
        bucketId: config.bucketId,
        subjectKey: config.subjectKey,
        windowStart: windowStartDate,
      },
    },
    create: {
      bucketId: config.bucketId,
      subjectKey: config.subjectKey,
      windowStart: windowStartDate,
      windowEnd: windowEndDate,
      count: 1,
    },
    update: {
      count: {
        increment: 1,
      },
      updatedAt: new Date(now),
    },
  });

  return {
    count: counter?.count ?? 1,
    resetAt: counter ? toTimestamp(counter.windowEnd) : windowEnd,
    windowStart,
  };
}

export async function resetDurableRateLimitStore() {
  await rateLimitPrisma.rateLimitCounter?.deleteMany({});
}

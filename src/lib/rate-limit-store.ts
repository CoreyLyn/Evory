import prisma from "./prisma";

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

  const counter = await prisma.$transaction(async (tx) => {
    await tx.rateLimitCounter.deleteMany({
      where: {
        windowEnd: { lte: new Date(now) },
      },
    });

    return tx.rateLimitCounter.upsert({
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
        count: { increment: 1 },
        updatedAt: new Date(now),
      },
    });
  });

  return {
    count: counter.count,
    resetAt: toTimestamp(counter.windowEnd),
    windowStart,
  };
}

export async function resetDurableRateLimitStore() {
  await prisma.rateLimitCounter.deleteMany({});
}

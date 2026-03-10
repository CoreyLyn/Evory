type RateLimitCounterRecord = {
  id: string;
  bucketId: string;
  subjectKey: string;
  windowStart: Date;
  windowEnd: Date;
  count: number;
  createdAt: Date;
  updatedAt: Date;
};

type RateLimitCounterPrismaMock = {
  rateLimitCounter?: {
    deleteMany: (args: {
      where?: { windowEnd?: { lte?: Date } };
    }) => Promise<{ count: number }>;
    upsert: (args: {
      where: {
        bucketId_subjectKey_windowStart: {
          bucketId: string;
          subjectKey: string;
          windowStart: Date;
        };
      };
      create: {
        bucketId: string;
        subjectKey: string;
        windowStart: Date;
        windowEnd: Date;
        count: number;
      };
      update: {
        count: { increment: number };
        updatedAt?: Date;
      };
    }) => Promise<RateLimitCounterRecord>;
  };
};

export function installRateLimitStoreMock(prismaClient: RateLimitCounterPrismaMock) {
  const rows = new Map<string, RateLimitCounterRecord>();
  return installRateLimitStoreMockWithRows(prismaClient, rows);
}

export function installRateLimitStoreMockWithRows(
  prismaClient: RateLimitCounterPrismaMock,
  rows: Map<string, RateLimitCounterRecord>
) {

  prismaClient.rateLimitCounter = {
    deleteMany: async ({
      where,
    }: {
      where?: { windowEnd?: { lte?: Date } };
    }) => {
      let deleted = 0;

      for (const [key, row] of rows.entries()) {
        if (!where?.windowEnd?.lte || row.windowEnd <= where.windowEnd.lte) {
          rows.delete(key);
          deleted += 1;
        }
      }

      return { count: deleted };
    },
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: {
        bucketId_subjectKey_windowStart: {
          bucketId: string;
          subjectKey: string;
          windowStart: Date;
        };
      };
      create: {
        bucketId: string;
        subjectKey: string;
        windowStart: Date;
        windowEnd: Date;
        count: number;
      };
      update: {
        count: { increment: number };
        updatedAt?: Date;
      };
    }) => {
      const keyParts = where.bucketId_subjectKey_windowStart;
      const key = [
        keyParts.bucketId,
        keyParts.subjectKey,
        keyParts.windowStart.toISOString(),
      ].join(":");
      const existing = rows.get(key);

      if (existing) {
        const next = {
          ...existing,
          count: existing.count + update.count.increment,
          updatedAt: update.updatedAt ?? new Date(Date.now()),
        };

        rows.set(key, next);
        return next;
      }

      const createdAt = new Date(Date.now());
      const next = {
        id: `rl-${rows.size + 1}`,
        bucketId: create.bucketId,
        subjectKey: create.subjectKey,
        windowStart: create.windowStart,
        windowEnd: create.windowEnd,
        count: create.count,
        createdAt,
        updatedAt: createdAt,
      };

      rows.set(key, next);
      return next;
    },
  };

  return rows;
}

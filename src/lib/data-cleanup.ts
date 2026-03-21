import prisma from "./prisma";

const BATCH_SIZE = 1000;

export const RETENTION_DAYS = {
  forumPostViews: 30,
  securityEvents: 90,
} as const;

type CleanupTableResult = { deleted: number };

export type DataCleanupResult = {
  forumPostViews: CleanupTableResult;
  userSessions: CleanupTableResult;
  securityEvents: CleanupTableResult;
  rateLimitCounters: CleanupTableResult;
};

type DataCleanupPrismaClient = {
  forumPostView: {
    findMany: (args: unknown) => Promise<{ id: string }[]>;
    deleteMany: (args: unknown) => Promise<{ count: number }>;
  };
  userSession: {
    findMany: (args: unknown) => Promise<{ id: string }[]>;
    deleteMany: (args: unknown) => Promise<{ count: number }>;
  };
  securityEvent: {
    findMany: (args: unknown) => Promise<{ id: string }[]>;
    deleteMany: (args: unknown) => Promise<{ count: number }>;
  };
  rateLimitCounter: {
    findMany: (args: unknown) => Promise<{ id: string }[]>;
    deleteMany: (args: unknown) => Promise<{ count: number }>;
  };
};

const cleanupPrisma = prisma as unknown as DataCleanupPrismaClient;

async function batchDelete(
  model: {
    findMany: (args: unknown) => Promise<{ id: string }[]>;
    deleteMany: (args: unknown) => Promise<{ count: number }>;
  },
  where: Record<string, unknown>
): Promise<number> {
  let totalDeleted = 0;

  while (true) {
    const batch = await model.findMany({
      where,
      select: { id: true },
      take: BATCH_SIZE,
    });

    if (batch.length === 0) break;

    const result = await model.deleteMany({
      where: { id: { in: batch.map((r) => r.id) } },
    });

    totalDeleted += result.count;

    if (batch.length < BATCH_SIZE) break;
  }

  return totalDeleted;
}

function daysAgo(days: number, now: Date): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export async function runDataCleanup(
  now?: Date
): Promise<DataCleanupResult> {
  const currentTime = now ?? new Date();

  const [forumPostViews, userSessions, securityEvents, rateLimitCounters] =
    await Promise.all([
      batchDelete(cleanupPrisma.forumPostView, {
        createdAt: { lt: daysAgo(RETENTION_DAYS.forumPostViews, currentTime) },
      }),
      batchDelete(cleanupPrisma.userSession, {
        expiresAt: { lte: currentTime },
      }),
      batchDelete(cleanupPrisma.securityEvent, {
        createdAt: { lt: daysAgo(RETENTION_DAYS.securityEvents, currentTime) },
      }),
      batchDelete(cleanupPrisma.rateLimitCounter, {
        windowEnd: { lte: currentTime },
      }),
    ]);

  return {
    forumPostViews: { deleted: forumPostViews },
    userSessions: { deleted: userSessions },
    securityEvents: { deleted: securityEvents },
    rateLimitCounters: { deleted: rateLimitCounters },
  };
}

import prisma from "./prisma";
import type { PointActionType, PointTransaction } from "@/generated/prisma/client";
import { POINT_RULES, DAILY_LIMITS } from "@/types";
import { recordAgentActivity } from "@/lib/agent-activity";

type DailyActionKey = PointActionType;
const CREATE_POST_REVERSAL_PREFIX = "create-post-reversal:";

let configCache: Record<string, { points: number; dailyLimit: number | null }> | null = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL = 5 * 60 * 1000;

export function invalidatePointConfigCache() {
  configCache = null;
  configCacheTime = 0;
}

async function getPointConfig(action: string): Promise<{ points: number; dailyLimit: number | null }> {
  const now = Date.now();
  if (!configCache || now - configCacheTime > CONFIG_CACHE_TTL) {
    try {
      const configs = await prisma.pointConfig.findMany();
      configCache = {};
      for (const c of configs) {
        configCache[c.action] = { points: c.points, dailyLimit: c.dailyLimit };
      }
      configCacheTime = now;
    } catch {
      configCache = null;
    }
  }

  if (configCache?.[action]) return configCache[action];

  const defaultPoints = (POINT_RULES as Record<string, number>)[action] ?? 0;
  const defaultLimit = (DAILY_LIMITS as Record<string, number>)[action] ?? null;
  return { points: defaultPoints, dailyLimit: defaultLimit };
}

export function getTodayDate(): Date {
  const timezone = process.env.NEXT_PUBLIC_TIMEZONE ?? "Asia/Shanghai";

  // 获取指定时区的当日零点（以 UTC 表示）
  const now = new Date();
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      dateStyle: "short",
    });
    const dateStr = formatter.format(now);
    return new Date(dateStr + "T00:00:00Z");
  } catch {
    // 无效时区，回退到 UTC
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return today;
  }
}

async function getActionLimit(actionKey: DailyActionKey): Promise<number | null> {
  const { dailyLimit } = await getPointConfig(actionKey);
  return typeof dailyLimit === "number" ? dailyLimit : null;
}

function getActionKeyForType(type: PointActionType): DailyActionKey | null {
  return type;
}

export async function awardPoints(
  agentId: string,
  type: PointActionType,
  amount?: number,
  referenceId?: string,
  description?: string,
  tx?: PrismaTransactionClient
): Promise<PointTransaction | null> {
  const actionKey = getActionKeyForType(type);
  const config = await getPointConfig(type);
  const resolvedAmount = amount ?? config.points;
  if (resolvedAmount <= 0) return null;

  const actionLimit = actionKey ? await getActionLimit(actionKey) : null;
  const today = getTodayDate();

  const execute = async (client: PrismaTransactionClient) => {
    // 在事务内：锁定并检查限额
    if (actionKey && actionLimit !== null) {
      // 尝试使用 FOR UPDATE 锁定行（更安全）
      // 如果 $queryRaw 不可用（如测试环境），则使用 upsert 作为 fallback
      let currentCount = 0;

      if (typeof client.$queryRaw === "function") {
        const rows = await client.$queryRaw<Array<{ actions: unknown }>>`
          SELECT actions FROM "DailyCheckin"
          WHERE "agentId" = ${agentId} AND "date" = ${today}
          FOR UPDATE
        `;
        const actions = (rows[0]?.actions ?? {}) as Record<string, number | boolean>;
        const rawCount = actions[actionKey];
        currentCount =
          typeof rawCount === "number" ? rawCount : rawCount === true ? 1 : 0;
      } else {
        // Fallback for test environments: use upsert to get/create the row
        const checkin = await client.dailyCheckin.upsert({
          where: { agentId_date: { agentId, date: today } },
          create: { agentId, date: today, actions: {} },
          update: {},
          select: { actions: true },
        });
        const actions = (checkin.actions ?? {}) as Record<string, number | boolean>;
        const rawCount = actions[actionKey];
        currentCount =
          typeof rawCount === "number" ? rawCount : rawCount === true ? 1 : 0;
      }

      if (currentCount >= actionLimit) {
        return null; // 已达限额
      }
    }

    const transaction = await client.pointTransaction.create({
      data: {
        agentId,
        amount: resolvedAmount,
        type,
        referenceId,
        description: description ?? "",
      },
    });

    await client.agent.update({
      where: { id: agentId },
      data: { points: { increment: resolvedAmount } },
    });

    if (actionKey && actionLimit !== null) {
      await recordDailyActionInternal(client, agentId, actionKey, today);
    }

    const activityType =
      type === ("DAILY_LOGIN" as PointActionType) ? "DAILY_CHECKIN" : "POINT_EARNED";

    await recordAgentActivity(
      {
        agentId,
        type: activityType as import("./agent-activity").AgentActivityType,
        summary:
          activityType === "DAILY_CHECKIN"
            ? "activity.checkin.dailyLogin"
            : "activity.point.earned",
        metadata: {
          points: resolvedAmount,
          actionType: type,
          ...(referenceId ? { referenceId } : {}),
        },
      },
      client
    );

    return transaction;
  };

  if (tx) return execute(tx);
  return prisma.$transaction(execute);
}

export async function deductPoints(
  agentId: string,
  amount: number,
  type: PointActionType,
  referenceId?: string,
  description?: string,
  tx?: PrismaTransactionClient
): Promise<PointTransaction | null> {
  if (amount <= 0) return null;

  const execute = async (client: PrismaTransactionClient) => {
    const updated = await client.agent.updateMany({
      where: {
        id: agentId,
        points: {
          gte: amount,
        },
      },
      data: { points: { decrement: amount } },
    });

    if (updated.count !== 1) {
      return null;
    }

    const transaction = await client.pointTransaction.create({
      data: {
        agentId,
        amount: -amount,
        type,
        referenceId,
        description: description ?? "",
      },
    });

    await recordAgentActivity(
      {
        agentId,
        type: "POINT_DEDUCTED",
        summary: "activity.point.deducted",
        metadata: {
          points: amount,
          actionType: type,
          ...(referenceId ? { referenceId } : {}),
        },
      },
      client
    );

    return transaction;
  };

  if (tx) return execute(tx);
  return prisma.$transaction(execute);
}

export async function forceDeductPoints(
  agentId: string,
  amount: number,
  type: PointActionType,
  referenceId?: string,
  description?: string,
  tx?: PrismaTransactionClient
): Promise<PointTransaction | null> {
  if (amount <= 0) return null;

  const execute = async (client: PrismaTransactionClient) => {
    await client.agent.update({
      where: { id: agentId },
      data: { points: { decrement: amount } },
    });

    const transaction = await client.pointTransaction.create({
      data: {
        agentId,
        amount: -amount,
        type,
        referenceId,
        description: description ?? "",
      },
    });

    await recordAgentActivity(
      {
        agentId,
        type: "POINT_DEDUCTED",
        summary: "activity.point.deducted",
        metadata: {
          points: amount,
          actionType: type,
          ...(referenceId ? { referenceId } : {}),
        },
      },
      client
    );

    return transaction;
  };

  if (tx) return execute(tx);
  return prisma.$transaction(execute);
}

export async function reverseCreatePostPointsIfNeeded(
  agentId: string,
  postId: string,
  description: string,
  tx?: PrismaTransactionClient
): Promise<PointTransaction | null> {
  const client = tx ?? prisma;
  const reversalReferenceId = `${CREATE_POST_REVERSAL_PREFIX}${postId}`;

  const originalReward = await client.pointTransaction.findFirst({
    where: {
      agentId,
      type: "CREATE_POST",
      referenceId: postId,
      amount: { gt: 0 },
    },
    orderBy: { createdAt: "desc" },
    select: { amount: true },
  });

  if (!originalReward) {
    return null;
  }

  const existingReversal = await client.pointTransaction.findFirst({
    where: {
      agentId,
      type: "CREATE_POST",
      referenceId: reversalReferenceId,
    },
    select: { id: true },
  });

  if (existingReversal) {
    return null;
  }

  return forceDeductPoints(
    agentId,
    originalReward.amount,
    "CREATE_POST",
    reversalReferenceId,
    description,
    tx
  );
}

export async function checkDailyAction(
  agentId: string,
  actionKey: DailyActionKey,
  limitOverride?: number | null
): Promise<boolean> {
  const limit = limitOverride ?? (await getActionLimit(actionKey));
  if (limit === null) return false;

  const today = getTodayDate();
  const checkin = await prisma.dailyCheckin.findUnique({
    where: {
      agentId_date: { agentId, date: today },
    },
  });

  const actions = (checkin?.actions ?? {}) as Record<string, number | boolean>;

  const rawCount = actions[actionKey];
  const count =
    typeof rawCount === "number" ? rawCount : rawCount === true ? 1 : 0;
  return count >= limit;
}

export async function recordDailyAction(
  agentId: string,
  actionKey: DailyActionKey
): Promise<void> {
  const today = getTodayDate();
  await prisma.$transaction(async (tx) => {
    await recordDailyActionInternal(tx, agentId, actionKey, today);
  });
}

export type PrismaTransactionClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

async function recordDailyActionInternal(
  tx: PrismaTransactionClient,
  agentId: string,
  actionKey: DailyActionKey,
  date: Date
): Promise<void> {
  const checkin = await tx.dailyCheckin.upsert({
    where: {
      agentId_date: { agentId, date },
    },
    create: {
      agentId,
      date,
      actions: {},
    },
    update: {},
  });

  const actions = (checkin.actions ?? {}) as Record<string, number | boolean>;

  const rawCount = actions[actionKey];
  const currentCount =
    typeof rawCount === "number" ? rawCount : rawCount === true ? 1 : 0;
  actions[actionKey] = currentCount + 1;

  await tx.dailyCheckin.update({
    where: { id: checkin.id },
    data: { actions },
  });
}

export async function getPointsBalance(agentId: string): Promise<number | null> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { points: true },
  });
  return agent?.points ?? null;
}

export async function getPointsHistory(
  agentId: string,
  limit = 50,
  offset = 0
): Promise<PointTransaction[]> {
  return prisma.pointTransaction.findMany({
    where: { agentId },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
}

export { getPointConfig };

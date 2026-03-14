import prisma from "./prisma";
import type { PointActionType, PointTransaction } from "@/generated/prisma/client";
import { POINT_RULES, DAILY_LIMITS } from "@/types";

type DailyActionKey = keyof typeof DAILY_LIMITS | "DAILY_LOGIN";

let configCache: Record<string, { points: number; dailyLimit: number | null }> | null = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL = 5 * 60 * 1000;

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

function getTodayDate(): Date {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today;
}

function getActionsLimit(actionKey: DailyActionKey): number | null {
  if (actionKey === "DAILY_LOGIN") return 1;
  if (actionKey in DAILY_LIMITS)
    return DAILY_LIMITS[actionKey as keyof typeof DAILY_LIMITS];
  return null;
}

function getDefaultAmount(type: PointActionType): number | null {
  if (type in POINT_RULES)
    return POINT_RULES[type as keyof typeof POINT_RULES];
  return null;
}

function getActionKeyForType(type: PointActionType): DailyActionKey | null {
  if (type === "DAILY_LOGIN") return "DAILY_LOGIN";
  if (type === "CREATE_POST") return "CREATE_POST";
  return null;
}

export async function awardPoints(
  agentId: string,
  type: PointActionType,
  amount?: number,
  referenceId?: string,
  description?: string
): Promise<PointTransaction | null> {
  const resolvedAmount = amount ?? getDefaultAmount(type);
  if (resolvedAmount === null || resolvedAmount <= 0) return null;

  const actionKey = getActionKeyForType(type);
  if (actionKey && (await checkDailyAction(agentId, actionKey))) return null;

  const today = getTodayDate();

  return prisma.$transaction(async (tx) => {
    const transaction = await tx.pointTransaction.create({
      data: {
        agentId,
        amount: resolvedAmount,
        type,
        referenceId,
        description: description ?? "",
      },
    });

    await tx.agent.update({
      where: { id: agentId },
      data: { points: { increment: resolvedAmount } },
    });

    if (actionKey) {
      await recordDailyActionInternal(tx, agentId, actionKey, today);
    }

    return transaction;
  });
}

export async function deductPoints(
  agentId: string,
  amount: number,
  type: PointActionType,
  referenceId?: string,
  description?: string
): Promise<PointTransaction | null> {
  if (amount <= 0) return null;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.agent.updateMany({
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

    const transaction = await tx.pointTransaction.create({
      data: {
        agentId,
        amount: -amount,
        type,
        referenceId,
        description: description ?? "",
      },
    });

    return transaction;
  });
}

export async function checkDailyAction(
  agentId: string,
  actionKey: DailyActionKey
): Promise<boolean> {
  const limit = getActionsLimit(actionKey);
  if (limit === null) return false;

  const today = getTodayDate();
  const checkin = await prisma.dailyCheckin.findUnique({
    where: {
      agentId_date: { agentId, date: today },
    },
  });

  const actions = (checkin?.actions ?? {}) as Record<string, number | boolean>;

  if (actionKey === "DAILY_LOGIN") {
    return actions.DAILY_LOGIN === true;
  }

  const count = (actions[actionKey] as number) ?? 0;
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

type PrismaTransactionClient = Parameters<
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

  if (actionKey === "DAILY_LOGIN") {
    actions.DAILY_LOGIN = true;
  } else {
    actions[actionKey] = ((actions[actionKey] as number) ?? 0) + 1;
  }

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


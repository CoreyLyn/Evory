import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { getPointConfig, invalidatePointConfigCache } from "./points";

const prismaClient = prisma as Record<string, unknown>;
const originalPointConfig = prismaClient.pointConfig;

beforeEach(() => {
  invalidatePointConfigCache();
});

afterEach(() => {
  prismaClient.pointConfig = originalPointConfig;
  invalidatePointConfigCache();
});

test("getPointConfig keeps cached values until invalidated", async () => {
  let configs = [
    {
      action: "CREATE_POST",
      points: 11,
      dailyLimit: 7,
    },
  ];

  prismaClient.pointConfig = {
    findMany: async () => configs,
  };

  const initial = await getPointConfig("CREATE_POST");

  configs = [
    {
      action: "CREATE_POST",
      points: 19,
      dailyLimit: 3,
    },
  ];

  const cached = await getPointConfig("CREATE_POST");
  invalidatePointConfigCache();
  const refreshed = await getPointConfig("CREATE_POST");

  assert.deepEqual(initial, { points: 11, dailyLimit: 7 });
  assert.deepEqual(cached, { points: 11, dailyLimit: 7 });
  assert.deepEqual(refreshed, { points: 19, dailyLimit: 3 });
});

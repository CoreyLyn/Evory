import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { createShopItemFixture } from "@/test/factories";
import { GET } from "./route";

type ShopRoutePrismaMock = {
  shopItem: {
    findMany: (args: { where: { isActive: boolean } }) => Promise<unknown[]>;
  };
};

const prismaClient = prisma as unknown as ShopRoutePrismaMock;
const originalShopItemFindMany = prismaClient.shopItem.findMany;

afterEach(() => {
  prismaClient.shopItem.findMany = originalShopItemFindMany;
});

test("GET /api/points/shop returns only active items", async () => {
  prismaClient.shopItem.findMany = async ({ where }) => {
    assert.deepEqual(where, { isActive: true });

    return [
      createShopItemFixture({ id: "active-crown", isActive: true }),
    ];
  };

  const response = await GET();
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.length, 1);
  assert.equal(json.data[0].id, "active-crown");
});

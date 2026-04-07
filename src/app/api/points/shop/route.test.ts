import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import prisma from "@/lib/prisma";
import { createShopItemFixture } from "@/test/factories";
import { GET } from "./route";

type ShopRoutePrismaMock = {
  shopItem: {
    findMany: (args: {
      where: { isActive: boolean };
      orderBy?: unknown;
    }) => Promise<unknown[]>;
  };
  catalogProduct?: {
    findMany: (args: {
      where: { isActive: boolean; productType: "SECRET_CREDENTIAL" };
      orderBy?: unknown;
    }) => Promise<
      Array<{
        id: string;
        name: string;
        description: string;
        productType: "SECRET_CREDENTIAL";
        price: number;
        displayConfig: unknown;
        fulfillmentConfig: unknown;
      }>
    >;
  };
  secretInventory?: {
    groupBy: (args: {
      by: ["productId"];
      where: { productId: { in: string[] }; status: "AVAILABLE" };
      _count: { _all: true };
    }) => Promise<Array<{ productId: string; _count: { _all: number } }>>;
  };
};

const prismaClient = prisma as unknown as ShopRoutePrismaMock;
const originalShopItemFindMany = prismaClient.shopItem.findMany;
const originalCatalogProduct = prismaClient.catalogProduct;
const originalSecretInventory = prismaClient.secretInventory;

afterEach(() => {
  prismaClient.shopItem.findMany = originalShopItemFindMany;
  prismaClient.catalogProduct = originalCatalogProduct;
  prismaClient.secretInventory = originalSecretInventory;
});

test("GET /api/points/shop returns only active items", async () => {
  prismaClient.shopItem.findMany = async ({ where }) => {
    assert.deepEqual(where, { isActive: true });

    return [
      {
        ...createShopItemFixture({
          id: "active-crown",
          isActive: true,
        }),
        entryType: "attempted-override",
        internalNote: "do-not-leak",
        createdAt: "2026-04-07T00:00:00.000Z",
      },
    ];
  };
  prismaClient.catalogProduct = {
    findMany: async () => [],
  };

  const response = await GET();
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(json.data.length, 1);
  assert.equal(json.data[0].id, "active-crown");
  assert.equal(json.data[0].entryType, "cosmetic");
  assert.equal("internalNote" in json.data[0], false);
  assert.equal("createdAt" in json.data[0], false);
});

test("GET /api/points/shop returns a mixed catalog list including active cosmetics and active secret credential products", async () => {
  prismaClient.shopItem.findMany = async ({ where }) => {
    assert.deepEqual(where, { isActive: true });
    return [
      {
        ...createShopItemFixture({ id: "active-crown", isActive: true }),
        internalOnlyFlag: true,
      },
    ];
  };

  prismaClient.catalogProduct = {
    findMany: async ({ where }) => {
      assert.deepEqual(where, {
        isActive: true,
        productType: "SECRET_CREDENTIAL",
      });

      return [
        {
          id: "secret-product-1",
          name: "Provider Key Pack",
          description: "One-time credential delivery",
          productType: "SECRET_CREDENTIAL",
          price: 250,
          displayConfig: {
            providerLabel: "Provider",
            usageInstructions: "Store securely",
          },
          fulfillmentConfig: {
            allowRepeatPurchase: false,
            perAgentPurchaseLimit: 2,
          },
        },
      ];
    },
  };

  prismaClient.secretInventory = {
    groupBy: async ({ by, where, _count }) => {
      assert.deepEqual(by, ["productId"]);
      assert.deepEqual(where, {
        productId: { in: ["secret-product-1"] },
        status: "AVAILABLE",
      });
      assert.deepEqual(_count, { _all: true });

      return [{ productId: "secret-product-1", _count: { _all: 3 } }];
    },
  };

  const response = await GET();
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.success, true);
  assert.equal(Array.isArray(json.data), true);

  const cosmeticEntry = json.data.find(
    (entry: any) => entry?.entryType === "cosmetic"
  );
  const secretEntry = json.data.find(
    (entry: any) => entry?.entryType === "secret_product"
  );

  assert.equal(cosmeticEntry?.id, "active-crown");
  assert.equal(cosmeticEntry?.entryType, "cosmetic");
  assert.equal("internalOnlyFlag" in cosmeticEntry, false);
  assert.equal(secretEntry?.id, "secret-product-1");
  assert.equal(secretEntry?.providerLabel, "Provider");
  assert.equal(secretEntry?.usageInstructions, "Store securely");
  assert.equal(secretEntry?.allowRepeatPurchase, false);
  assert.equal(secretEntry?.perAgentPurchaseLimit, 2);
  assert.equal(secretEntry?.availableInventoryCount, 3);
  assert.equal(secretEntry?.isInStock, true);

  assert.equal("encryptedValue" in secretEntry, false);
  assert.equal("maskedValue" in secretEntry, false);
  assert.equal("displayConfig" in secretEntry, false);
  assert.equal("fulfillmentConfig" in secretEntry, false);
});

test("GET /api/points/shop derives secret-product stock metadata from AVAILABLE inventory rows only", async () => {
  prismaClient.shopItem.findMany = async () => [];

  prismaClient.catalogProduct = {
    findMany: async () => [
      {
        id: "secret-product-2",
        name: "Another Secret Pack",
        description: "Credential delivery",
        productType: "SECRET_CREDENTIAL",
        price: 250,
        displayConfig: {
          providerLabel: "Provider",
          usageInstructions: "Store securely",
        },
        fulfillmentConfig: {
          allowRepeatPurchase: true,
          perAgentPurchaseLimit: null,
        },
      },
    ],
  };

  prismaClient.secretInventory = {
    groupBy: async ({ where }) => {
      assert.equal(where.status, "AVAILABLE");
      return [];
    },
  };

  const response = await GET();
  const json = await response.json();

  const secretEntry = json.data.find(
    (entry: any) => entry?.entryType === "secret_product"
  );

  assert.equal(secretEntry?.availableInventoryCount, 0);
  assert.equal(secretEntry?.isInStock, false);
});

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
      where: { isActive: boolean; productType: "API_QUOTA" };
      orderBy?: unknown;
    }) => Promise<
      Array<{
        id: string;
        name: string;
        description: string;
        productType: "API_QUOTA";
        price: number;
        currencyType: "POINTS";
        displayConfig: unknown;
        fulfillmentConfig: unknown;
      }>
    >;
  };
};

const prismaClient = prisma as unknown as ShopRoutePrismaMock;
const originalShopItemFindMany = prismaClient.shopItem.findMany;
const originalCatalogProduct = prismaClient.catalogProduct;

afterEach(() => {
  prismaClient.shopItem.findMany = originalShopItemFindMany;
  prismaClient.catalogProduct = originalCatalogProduct;
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

test("GET /api/points/shop returns a mixed catalog list including active cosmetics and active api quota products", async () => {
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
        productType: "API_QUOTA",
      });

      return [
        {
          id: "api-quota-product-1",
          name: "Provider Quota Pack",
          description: "10k tokens fulfilled by admin confirmation",
          productType: "API_QUOTA",
          price: 250,
          currencyType: "POINTS",
          displayConfig: {
            providerLabel: "Provider",
            usageInstructions: "Store securely",
            quotaUnitLabel: "tokens",
          },
          fulfillmentConfig: {
            quotaAmount: 10000,
            allowRepeatPurchase: false,
            perAgentPurchaseLimit: 2,
          },
        },
      ];
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
  const apiQuotaEntry = json.data.find(
    (entry: any) => entry?.entryType === "api_quota_product"
  );

  assert.equal(cosmeticEntry?.id, "active-crown");
  assert.equal(cosmeticEntry?.entryType, "cosmetic");
  assert.equal("internalOnlyFlag" in cosmeticEntry, false);
  assert.equal(apiQuotaEntry?.id, "api-quota-product-1");
  assert.equal(apiQuotaEntry?.providerLabel, "Provider");
  assert.equal(apiQuotaEntry?.usageInstructions, "Store securely");
  assert.equal(apiQuotaEntry?.quotaAmount, 10000);
  assert.equal(apiQuotaEntry?.quotaUnitLabel, "tokens");
  assert.equal(apiQuotaEntry?.allowRepeatPurchase, false);
  assert.equal(apiQuotaEntry?.perAgentPurchaseLimit, 2);
  assert.equal(apiQuotaEntry?.currencyType, "POINTS");

  assert.equal("availableInventoryCount" in apiQuotaEntry, false);
  assert.equal("isInStock" in apiQuotaEntry, false);
  assert.equal("displayConfig" in apiQuotaEntry, false);
  assert.equal("fulfillmentConfig" in apiQuotaEntry, false);
});

test("GET /api/points/shop omits stock metadata for api quota products", async () => {
  prismaClient.shopItem.findMany = async () => [];

  prismaClient.catalogProduct = {
    findMany: async () => [
      {
        id: "api-quota-product-2",
        name: "Another Quota Pack",
        description: "Quota fulfilled after admin review",
        productType: "API_QUOTA",
        price: 250,
        currencyType: "POINTS",
        displayConfig: {
          providerLabel: "Provider",
          usageInstructions: "Store securely",
          quotaUnitLabel: "calls",
        },
        fulfillmentConfig: {
          quotaAmount: 5000,
          allowRepeatPurchase: true,
          perAgentPurchaseLimit: null,
        },
      },
    ],
  };

  const response = await GET();
  const json = await response.json();

  const apiQuotaEntry = json.data.find(
    (entry: any) => entry?.entryType === "api_quota_product"
  );

  assert.equal(apiQuotaEntry?.quotaAmount, 5000);
  assert.equal(apiQuotaEntry?.quotaUnitLabel, "calls");
  assert.equal("availableInventoryCount" in apiQuotaEntry, false);
  assert.equal("isInStock" in apiQuotaEntry, false);
});

test("GET /api/points/shop returns 500 when an active api quota product has invalid quota config", async () => {
  prismaClient.shopItem.findMany = async () => [];
  prismaClient.catalogProduct = {
    findMany: async () => [
      {
        id: "broken-api-quota",
        name: "Broken quota pack",
        description: "Invalid quota config",
        productType: "API_QUOTA",
        price: 250,
        currencyType: "POINTS",
        displayConfig: {
          providerLabel: "Provider",
          quotaUnitLabel: "tokens",
        },
        fulfillmentConfig: {
          allowRepeatPurchase: true,
          perAgentPurchaseLimit: null,
        },
      },
    ],
  };

  const response = await GET();
  const json = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(json, {
    success: false,
    error: "Internal server error",
  });
});

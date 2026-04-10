import assert from "node:assert/strict";
import test from "node:test";

import {
  createAdminProvidedApiKey,
  createAdminSecretProduct,
  equipInventoryItem,
  fetchAdminProvidedApiKeys,
  fetchAdminSecretProductOrders,
  fetchAdminSecretProducts,
  fetchAgentSecretProductOrders,
  fetchAgentShopCatalog,
  fetchAgentInventory,
  fetchPointsBalance,
  fetchShopItems,
  fulfillAdminQuotaOrder,
  importAdminSecretInventory,
  purchaseShopItem,
  updateAdminProvidedApiKey,
} from "./shop-client";

test("fetchShopItems reads the public catalog", async () => {
  let requestInput = "";

  const items = await fetchShopItems(async (input) => {
    requestInput = String(input);

    return new Response(
      JSON.stringify({
        success: true,
        data: [
          {
            entryType: "cosmetic",
            id: "crown",
            name: "Crown",
            description: "A royal crown for the top agent",
            price: 200,
            type: "hat",
            category: "hat",
            spriteKey: "crown",
          },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  assert.equal(requestInput, "/api/points/shop");
  assert.equal(items[0]?.name, "Crown");
});

test("fetchShopItems normalizes mixed public catalog entries", async () => {
  const items = await fetchShopItems(async () => {
    return new Response(
      JSON.stringify({
        success: true,
        data: [
          {
            entryType: "cosmetic",
            id: "crown",
            name: "Crown",
            description: "A royal crown for the top agent",
            price: 200,
            type: "hat",
            category: "hat",
            spriteKey: "crown",
          },
          {
            entryType: "api_quota_product",
            id: "product-1",
            name: "Provider Quota Pack",
            description: "10k tokens",
            price: 300,
            quotaAmount: 10000,
            quotaUnitLabel: "tokens",
          },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  assert.equal(items.length, 2);

  const [first, second] = items;
  assert.equal(first?.entryType, "cosmetic");
  assert.equal(second?.entryType, "api_quota_product");

  assert.equal(first?.currencyType, "POINTS");
  assert.equal(second?.currencyType, "POINTS");

  if (first?.entryType === "cosmetic") {
    assert.equal(first.spriteKey, "crown");
    assert.equal(first.category, "hat");
    assert.equal(first.type, "hat");
  }

  if (second?.entryType === "api_quota_product") {
    assert.equal(second.providerLabel, null);
    assert.equal(second.usageInstructions, null);
    assert.equal(second.quotaAmount, 10000);
    assert.equal(second.quotaUnitLabel, "tokens");
    assert.equal(second.allowRepeatPurchase, true);
    assert.equal(second.perAgentPurchaseLimit, null);
  }
});

test("fetchShopItems preserves api quota detail fields", async () => {
  const items = await fetchShopItems(async () => {
    return new Response(
      JSON.stringify({
        success: true,
        data: [
          {
            entryType: "api_quota_product",
            id: "product-1",
            name: "Provider Quota Pack",
            description: "10k tokens",
            price: 300,
            providerLabel: "Provider",
            usageInstructions: "Store securely",
            quotaAmount: 10000,
            quotaUnitLabel: "tokens",
            allowRepeatPurchase: false,
            perAgentPurchaseLimit: 2,
          },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  assert.equal(items[0]?.entryType, "api_quota_product");

  const entry = items[0];
  if (entry?.entryType === "api_quota_product") {
    assert.equal(entry.providerLabel, "Provider");
    assert.equal(entry.usageInstructions, "Store securely");
    assert.equal(entry.quotaAmount, 10000);
    assert.equal(entry.quotaUnitLabel, "tokens");
    assert.equal(entry.allowRepeatPurchase, false);
    assert.equal(entry.perAgentPurchaseLimit, 2);
  }
});

test("fetchShopItems tolerates entries with missing descriptions", async () => {
  const items = await fetchShopItems(async () => {
    return new Response(
      JSON.stringify({
        success: true,
        data: [
          {
            entryType: "api_quota_product",
            id: "product-1",
            name: "Provider Quota Pack",
            price: 300,
            providerLabel: "Provider",
            quotaAmount: 5000,
            quotaUnitLabel: "credits",
          },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  assert.equal(items[0]?.entryType, "api_quota_product");

  const entry = items[0];
  if (entry?.entryType === "api_quota_product") {
    assert.equal(entry.description, "");
    assert.equal(entry.quotaAmount, 5000);
    assert.equal(entry.quotaUnitLabel, "credits");
  }
});

test("fetchShopItems rejects success envelopes with null data", async () => {
  await assert.rejects(
    () =>
      fetchShopItems(async () => {
        return new Response(
          JSON.stringify({
            success: true,
            data: null,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }),
    /Shop request failed/
  );
});

test("fetchShopItems rejects success envelopes with undefined data", async () => {
  await assert.rejects(
    () =>
      fetchShopItems(async () => {
        return new Response(
          JSON.stringify({
            success: true,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }),
    /Shop request failed/
  );
});

test("fetchShopItems rejects unexpected currency types", async () => {
  await assert.rejects(
    () =>
      fetchShopItems(async () => {
        return new Response(
          JSON.stringify({
            success: true,
            data: [
              {
                entryType: "cosmetic",
                id: "crown",
                name: "Crown",
                description: "A royal crown for the top agent",
                price: 200,
                currencyType: "USD",
                type: "hat",
                category: "hat",
                spriteKey: "crown",
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }),
    /currencyType/
  );
});

test("fetchAgentShopCatalog reads the agent shop response", async () => {
  let requestInput = "";

  const catalog = await fetchAgentShopCatalog(async (input) => {
    requestInput = String(input);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          cosmetics: [{ id: "crown", name: "Crown" }],
          apiQuotaProducts: [
            {
              id: "product-1",
              name: "Provider Quota Pack",
              description: "10k tokens",
              price: 300,
              productType: "API_QUOTA",
              entryType: "api_quota_product",
              providerLabel: "Provider",
              usageInstructions: "Store securely",
              quotaAmount: 10000,
              quotaUnitLabel: "tokens",
              allowRepeatPurchase: false,
              perAgentPurchaseLimit: 2,
            },
          ],
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  assert.equal(requestInput, "/api/agent/shop");
  assert.equal(catalog.cosmetics[0]?.id, "crown");
  assert.equal(catalog.apiQuotaProducts[0]?.id, "product-1");
  assert.equal(catalog.apiQuotaProducts[0]?.usageInstructions, "Store securely");
  assert.equal(catalog.apiQuotaProducts[0]?.quotaAmount, 10000);
  assert.equal(catalog.apiQuotaProducts[0]?.quotaUnitLabel, "tokens");
  assert.equal(catalog.apiQuotaProducts[0]?.allowRepeatPurchase, false);
  assert.equal(catalog.apiQuotaProducts[0]?.perAgentPurchaseLimit, 2);
});

test("fetchAdminSecretProducts reads the lean admin secret products list shape", async () => {
  let requestInput = "";

  const products = await fetchAdminSecretProducts(async (input) => {
    requestInput = String(input);

    return new Response(
      JSON.stringify({
        success: true,
        data: [
          {
            id: "product-1",
            name: "Provider Pack",
            description: "Secret credential",
            productType: "API_QUOTA",
            price: 300,
            currencyType: "POINTS",
            isActive: true,
            displayConfig: { providerLabel: "Provider" },
            fulfillmentConfig: { allowRepeatPurchase: true },
            orderCount: 1,
            createdAt: "2026-04-02T00:00:00.000Z",
            updatedAt: "2026-04-02T00:00:00.000Z",
          },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  assert.equal(requestInput, "/api/admin/shop/products");
  assert.equal("availableInventoryCount" in (products[0] ?? {}), false);
  assert.equal("soldInventoryCount" in (products[0] ?? {}), false);
  assert.equal("voidInventoryCount" in (products[0] ?? {}), false);
  assert.equal(products[0]?.orderCount, 1);
});

test("fetchAdminProvidedApiKeys reads the admin provided api key list", async () => {
  const keys = await fetchAdminProvidedApiKeys(async () =>
    new Response(
      JSON.stringify({
        success: true,
        data: [
          {
            id: "key-1",
            label: "Primary OpenAI key",
            providerLabel: "OpenAI",
            maskedKey: "sk-****1234",
            isActive: true,
            createdByUserId: "admin-1",
            createdAt: "2026-04-08T10:00:00.000Z",
            updatedAt: "2026-04-08T10:00:00.000Z",
          },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    )
  );

  assert.equal(keys[0]?.id, "key-1");
  assert.equal(keys[0]?.maskedKey, "sk-****1234");
});

test("fetchAdminSecretProductOrders reads admin order history with filters", async () => {
  const requests: string[] = [];

  const orders = await fetchAdminSecretProductOrders(
    async (input) => {
      requests.push(String(input));

      return new Response(
        JSON.stringify({
          success: true,
          data: [
            {
              id: "order-1",
              status: "FULFILLED",
              pricePaid: 300,
              currencyType: "POINTS",
              deliveryChannel: "AGENT_CHAT",
              failureReason: null,
              quota: {
                amount: 10000,
                unit: "tokens",
              },
              createdAt: "2026-04-07T10:00:00.000Z",
              confirmedAt: "2026-04-07T10:01:00.000Z",
              fulfilledAt: "2026-04-07T10:01:00.000Z",
              product: {
                id: "product-1",
                name: "Provider Pack",
                isActive: true,
              },
              buyer: {
                agentId: "agent-2",
                name: "Buyer Agent",
                type: "CUSTOM",
                ownerUserId: "user-2",
              },
              providedApiKey: {
                id: "key-1",
                label: "Primary OpenAI key",
                maskedKey: "sk-****1234",
                providerLabel: "OpenAI",
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    },
    {
      productId: "product-1",
      buyerAgentId: "agent-2",
      status: "FULFILLED",
    }
  );

  assert.equal(
    requests[0],
    "/api/admin/shop/orders?productId=product-1&buyerAgentId=agent-2&status=FULFILLED"
  );
  assert.equal(orders[0]?.buyer.agentId, "agent-2");
  assert.equal(orders[0]?.quota.amount, 10000);
  assert.equal(orders[0]?.providedApiKey?.maskedKey, "sk-****1234");
});

test("fetchAgentSecretProductOrders reads masked buyer order history", async () => {
  const requests: string[] = [];

  const orders = await fetchAgentSecretProductOrders(
    async (input) => {
      requests.push(String(input));

      return new Response(
        JSON.stringify({
          success: true,
          data: [
            {
              id: "order-1",
              status: "FULFILLED",
              pricePaid: 300,
              currencyType: "POINTS",
              deliveryChannel: "AGENT_CHAT",
              failureReason: null,
              quota: {
                amount: 10000,
                unit: "tokens",
              },
              createdAt: "2026-04-07T10:00:00.000Z",
              confirmedAt: "2026-04-07T10:01:00.000Z",
              fulfilledAt: "2026-04-07T10:01:00.000Z",
              product: {
                id: "product-1",
                name: "Provider Pack",
                isActive: true,
              },
              providedApiKey: {
                id: "key-1",
                label: "Primary OpenAI key",
                maskedKey: "sk-****1234",
                providerLabel: "OpenAI",
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    },
    {
      productId: "product-1",
      status: "FULFILLED",
    }
  );

  assert.equal(
    requests[0],
    "/api/agent/shop/orders?productId=product-1&status=FULFILLED"
  );
  assert.equal(orders[0]?.product.id, "product-1");
  assert.equal(orders[0]?.quota.unit, "tokens");
  assert.equal(orders[0]?.providedApiKey?.maskedKey, "sk-****1234");
});

test("createAdminSecretProduct posts the create payload and reads the raw product response", async () => {
  const requests: Array<{ input: string; init?: RequestInit }> = [];

  const product = await createAdminSecretProduct(async (input, init) => {
    requests.push({ input: String(input), init });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: "product-1",
          name: "Provider Pack",
          description: "Secret credential",
          productType: "API_QUOTA",
          price: 300,
          currencyType: "POINTS",
          isActive: true,
          displayConfig: {
            providerLabel: "Provider",
            usageInstructions: "Store securely",
            quotaUnitLabel: "tokens",
          },
          fulfillmentConfig: {
            quotaAmount: 10000,
            allowRepeatPurchase: true,
          },
          createdAt: "2026-04-02T00:00:00.000Z",
          updatedAt: "2026-04-02T00:00:00.000Z",
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }, {
    name: "Provider Pack",
    description: "Secret credential",
    price: 300,
    providerLabel: "Provider",
    usageInstructions: "Store securely",
    quotaAmount: 10000,
    quotaUnitLabel: "tokens",
    allowRepeatPurchase: true,
  });

  assert.equal(requests[0]?.input, "/api/admin/shop/products");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    name: "Provider Pack",
    description: "Secret credential",
    productType: "API_QUOTA",
    price: 300,
    isActive: true,
    displayConfig: {
      providerLabel: "Provider",
      usageInstructions: "Store securely",
      quotaUnitLabel: "tokens",
    },
    fulfillmentConfig: {
      quotaAmount: 10000,
      allowRepeatPurchase: true,
    },
  });
  assert.equal("inventoryCount" in product, false);
  assert.equal("orderCount" in product, false);
  assert.equal(product.id, "product-1");
});

test("importAdminSecretInventory posts the selected product inventory payload", async () => {
  const requests: Array<{ input: string; init?: RequestInit }> = [];

  const result = await importAdminSecretInventory(async (input, init) => {
    requests.push({ input: String(input), init });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          importBatchId: "batch-1",
          importCount: 2,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }, {
    productId: "product-1",
    sourceLabel: "batch-1",
    note: "initial load",
    secrets: "sk-1\nsk-2",
  });

  assert.equal(requests[0]?.input, "/api/admin/shop/products/product-1/inventory");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    sourceLabel: "batch-1",
    note: "initial load",
    secrets: "sk-1\nsk-2",
  });
  assert.deepEqual(result, {
    importBatchId: "batch-1",
    importCount: 2,
  });
});

test("createAdminProvidedApiKey, updateAdminProvidedApiKey, and fulfillAdminQuotaOrder call admin endpoints", async () => {
  const requests: Array<{ input: string; init?: RequestInit }> = [];

  const fetcher = async (input: string, init?: RequestInit) => {
    requests.push({ input, init });
    return new Response(
      JSON.stringify({
        success: true,
        data: { id: "ok" },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  };

  await createAdminProvidedApiKey(fetcher, {
    label: "Primary OpenAI key",
    providerLabel: "OpenAI",
    apiKey: "sk-live-123",
  });
  await updateAdminProvidedApiKey(fetcher, "key-1", {
    label: "Primary OpenAI key",
    providerLabel: "OpenAI",
    isActive: false,
  });
  await fulfillAdminQuotaOrder(fetcher, "order-1");

  assert.equal(requests[0]?.input, "/api/admin/shop/api-keys");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    label: "Primary OpenAI key",
    providerLabel: "OpenAI",
    apiKey: "sk-live-123",
    isActive: true,
  });

  assert.equal(requests[1]?.input, "/api/admin/shop/api-keys/key-1");
  assert.equal(requests[1]?.init?.method, "PUT");
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), {
    label: "Primary OpenAI key",
    providerLabel: "OpenAI",
    isActive: false,
  });

  assert.equal(requests[2]?.input, "/api/admin/shop/orders/order-1/fulfill");
  assert.equal(requests[2]?.init?.method, "POST");
  assert.equal(requests[2]?.init?.body, undefined);
});

test("purchaseShopItem and equipInventoryItem call the authenticated endpoints", async () => {
  const requests: Array<{ input: string; method: string; body: string | null }> = [];

  const agentFetch = async (input: string, init?: RequestInit) => {
    requests.push({
      input,
      method: String(init?.method ?? "GET"),
      body: typeof init?.body === "string" ? init.body : null,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: { ok: true },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  };

  await purchaseShopItem(agentFetch, "crown");
  await purchaseShopItem(agentFetch, { productId: "product-1" });
  await equipInventoryItem(agentFetch, "crown");

  assert.deepEqual(requests, [
    {
      input: "/api/agent/shop/purchase",
      method: "POST",
      body: JSON.stringify({ itemId: "crown" }),
    },
    {
      input: "/api/agent/shop/purchase",
      method: "POST",
      body: JSON.stringify({ productId: "product-1" }),
    },
    {
      input: "/api/agent/equipment",
      method: "PUT",
      body: JSON.stringify({ itemId: "crown" }),
    },
  ]);
});

test("fetchAgentInventory and fetchPointsBalance read authenticated resources", async () => {
  const requests: string[] = [];

  const agentFetch = async (input: string) => {
    requests.push(input);

    return new Response(
      JSON.stringify({
        success: true,
        data: input.includes("balance") ? { balance: 25 } : [{ id: "inventory-1" }],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  };

  const balance = await fetchPointsBalance(agentFetch);
  const inventory = await fetchAgentInventory(agentFetch);

  assert.equal(balance, 25);
  assert.equal(Array.isArray(inventory), true);
  assert.deepEqual(requests, [
    "/api/agent/points/balance",
    "/api/agent/inventory",
  ]);
});

test("shop client helpers surface api errors", async () => {
  await assert.rejects(
    () =>
      purchaseShopItem(
        async () =>
          new Response(
            JSON.stringify({
              success: false,
              error: "Insufficient points",
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          ),
        "crown"
      ),
    /Insufficient points/
  );
});

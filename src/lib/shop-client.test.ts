import assert from "node:assert/strict";
import test from "node:test";

import {
  createAdminSecretProduct,
  equipInventoryItem,
  fetchAdminSecretProductOrders,
  fetchAdminSecretProducts,
  fetchAgentSecretProductOrders,
  fetchAgentShopCatalog,
  fetchAgentInventory,
  fetchPointsBalance,
  fetchShopItems,
  importAdminSecretInventory,
  purchaseShopItem,
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
            entryType: "secret_product",
            id: "product-1",
            name: "Provider Pack",
            description: "Secret credential",
            price: 300,
            availableInventoryCount: 3,
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
  assert.equal(second?.entryType, "secret_product");

  assert.equal(first?.currencyType, "POINTS");
  assert.equal(second?.currencyType, "POINTS");

  if (first?.entryType === "cosmetic") {
    assert.equal(first.spriteKey, "crown");
    assert.equal(first.category, "hat");
    assert.equal(first.type, "hat");
  }

  if (second?.entryType === "secret_product") {
    assert.equal(second.providerLabel, null);
    assert.equal(second.usageInstructions, null);
    assert.equal(second.allowRepeatPurchase, true);
    assert.equal(second.perAgentPurchaseLimit, null);
    assert.equal(second.availableInventoryCount, 3);
    assert.equal(second.isInStock, true);
  }
});

test("fetchShopItems preserves secret-product detail fields", async () => {
  const items = await fetchShopItems(async () => {
    return new Response(
      JSON.stringify({
        success: true,
        data: [
          {
            entryType: "secret_product",
            id: "product-1",
            name: "Provider Pack",
            description: "Secret credential",
            price: 300,
            providerLabel: "Provider",
            usageInstructions: "Store securely",
            allowRepeatPurchase: false,
            perAgentPurchaseLimit: 2,
            availableInventoryCount: 0,
            isInStock: false,
          },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  assert.equal(items[0]?.entryType, "secret_product");

  const entry = items[0];
  if (entry?.entryType === "secret_product") {
    assert.equal(entry.providerLabel, "Provider");
    assert.equal(entry.usageInstructions, "Store securely");
    assert.equal(entry.allowRepeatPurchase, false);
    assert.equal(entry.perAgentPurchaseLimit, 2);
    assert.equal(entry.availableInventoryCount, 0);
    assert.equal(entry.isInStock, false);
  }
});

test("fetchShopItems tolerates entries with missing descriptions", async () => {
  const items = await fetchShopItems(async () => {
    return new Response(
      JSON.stringify({
        success: true,
        data: [
          {
            entryType: "secret_product",
            id: "product-1",
            name: "Provider Pack",
            price: 300,
            providerLabel: "Provider",
            availableInventoryCount: 1,
          },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  });

  assert.equal(items[0]?.entryType, "secret_product");

  const entry = items[0];
  if (entry?.entryType === "secret_product") {
    assert.equal(entry.description, "");
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
          secretProducts: [
            {
              id: "product-1",
              name: "Provider Pack",
              description: "Secret credential",
              price: 300,
              productType: "SECRET_CREDENTIAL",
              providerLabel: "Provider",
              usageInstructions: "Store securely",
              allowRepeatPurchase: false,
              perAgentPurchaseLimit: 2,
              availableInventoryCount: 0,
              isInStock: false,
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
  assert.equal(catalog.secretProducts[0]?.id, "product-1");
  assert.equal(catalog.secretProducts[0]?.usageInstructions, "Store securely");
  assert.equal(catalog.secretProducts[0]?.allowRepeatPurchase, false);
  assert.equal(catalog.secretProducts[0]?.perAgentPurchaseLimit, 2);
  assert.equal(catalog.secretProducts[0]?.availableInventoryCount, 0);
  assert.equal(catalog.secretProducts[0]?.isInStock, false);
});

test("fetchAdminSecretProducts reads the admin secret products list shape", async () => {
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
            productType: "SECRET_CREDENTIAL",
            price: 300,
            currencyType: "POINTS",
            isActive: true,
            displayConfig: { providerLabel: "Provider" },
            fulfillmentConfig: { allowRepeatPurchase: true },
            inventoryCount: 2,
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
  assert.equal(products[0]?.inventoryCount, 2);
  assert.equal(products[0]?.orderCount, 1);
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
              createdAt: "2026-04-07T10:00:00.000Z",
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
              delivery: {
                deliveredAt: "2026-04-07T10:01:30.000Z",
                secretInventoryId: "inventory-1",
                maskedSecret: "sk-****1234",
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
  assert.equal(orders[0]?.delivery.maskedSecret, "sk-****1234");
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
              createdAt: "2026-04-07T10:00:00.000Z",
              fulfilledAt: "2026-04-07T10:01:00.000Z",
              product: {
                id: "product-1",
                name: "Provider Pack",
                isActive: true,
              },
              delivery: {
                deliveredAt: "2026-04-07T10:01:30.000Z",
                secretInventoryId: "inventory-1",
                maskedSecret: "sk-****1234",
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
  assert.equal(orders[0]?.delivery.maskedSecret, "sk-****1234");
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
          productType: "SECRET_CREDENTIAL",
          price: 300,
          currencyType: "POINTS",
          isActive: true,
          displayConfig: {
            providerLabel: "Provider",
            usageInstructions: "Store securely",
          },
          fulfillmentConfig: {
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
    allowRepeatPurchase: true,
  });

  assert.equal(requests[0]?.input, "/api/admin/shop/products");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), {
    name: "Provider Pack",
    description: "Secret credential",
    productType: "SECRET_CREDENTIAL",
    price: 300,
    isActive: true,
    displayConfig: {
      providerLabel: "Provider",
      usageInstructions: "Store securely",
    },
    fulfillmentConfig: {
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

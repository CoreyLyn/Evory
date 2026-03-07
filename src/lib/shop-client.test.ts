import assert from "node:assert/strict";
import test from "node:test";

import {
  equipInventoryItem,
  fetchAgentInventory,
  fetchPointsBalance,
  fetchShopItems,
  purchaseShopItem,
} from "./shop-client";

test("fetchShopItems reads the public catalog", async () => {
  let requestInput = "";

  const items = await fetchShopItems(async (input) => {
    requestInput = String(input);

    return new Response(
      JSON.stringify({
        success: true,
        data: [{ id: "crown", name: "Crown" }],
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

test("purchaseShopItem and equipInventoryItem call the authenticated endpoints", async () => {
  const requests: Array<{ input: string; method: string }> = [];

  const agentFetch = async (input: string, init?: RequestInit) => {
    requests.push({
      input,
      method: String(init?.method ?? "GET"),
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
  await equipInventoryItem(agentFetch, "crown");

  assert.deepEqual(requests, [
    { input: "/api/points/shop/purchase", method: "POST" },
    { input: "/api/agents/me/equipment", method: "PUT" },
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
    "/api/points/balance",
    "/api/agents/me/inventory",
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

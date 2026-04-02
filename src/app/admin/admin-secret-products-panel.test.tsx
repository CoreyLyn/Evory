import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  AdminSecretProductsPanel,
  normalizeInventoryProductId,
  performAdminSecretProductMutation,
} from "./admin-secret-products-panel";

test("AdminSecretProductsPanel renders provider fields and inventory import textarea", () => {
  const html = renderToStaticMarkup(
    <AdminSecretProductsPanel
      t={(key) => key}
      products={[
        {
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
          inventoryCount: 2,
          orderCount: 1,
          createdAt: "2026-04-02T00:00:00.000Z",
          updatedAt: "2026-04-02T00:00:00.000Z",
        },
      ]}
      loading={false}
      onRefresh={() => Promise.resolve()}
      onError={() => undefined}
      onSuccess={() => undefined}
    />
  );

  assert.match(html, /admin\.products\.form\.providerLabel/);
  assert.match(html, /admin\.products\.form\.usageInstructions/);
  assert.match(html, /admin\.products\.inventory\.secrets/);
  assert.match(html, /textarea/);
});

test("AdminSecretProductsPanel renders product counts and inactive state details", () => {
  const html = renderToStaticMarkup(
    <AdminSecretProductsPanel
      t={(key) => key}
      products={[
        {
          id: "product-1",
          name: "Provider Pack",
          description: "Secret credential",
          productType: "SECRET_CREDENTIAL",
          price: 300,
          currencyType: "POINTS",
          isActive: true,
          displayConfig: {
            providerLabel: "Provider",
          },
          fulfillmentConfig: {
            allowRepeatPurchase: true,
          },
          inventoryCount: 2,
          orderCount: 1,
          createdAt: "2026-04-02T00:00:00.000Z",
          updatedAt: "2026-04-02T00:00:00.000Z",
        },
        {
          id: "product-2",
          name: "Backup Pack",
          description: "",
          productType: "SECRET_CREDENTIAL",
          price: 500,
          currencyType: "POINTS",
          isActive: false,
          displayConfig: {
            providerLabel: "Backup",
          },
          fulfillmentConfig: {
            allowRepeatPurchase: false,
          },
          inventoryCount: 0,
          orderCount: 3,
          createdAt: "2026-04-02T00:00:00.000Z",
          updatedAt: "2026-04-02T00:00:00.000Z",
        },
      ]}
      loading={false}
      onRefresh={() => Promise.resolve()}
      onError={() => undefined}
      onSuccess={() => undefined}
    />
  );

  assert.match(html, /Provider Pack/);
  assert.match(html, /Backup Pack/);
  assert.match(html, /admin\.products\.status\.inactive/);
  assert.match(html, /admin\.products\.inventory\.count/);
  assert.match(html, /admin\.products\.orders\.count/);
  assert.match(html, /Provider/);
  assert.match(html, /Backup/);
  assert.match(html, />2</);
  assert.match(html, />3</);
});

test("performAdminSecretProductMutation stays pending until refresh finishes", async () => {
  const events: string[] = [];
  let resolveRefresh: (() => void) | null = null;

  const mutationPromise = performAdminSecretProductMutation({
    request: async () => ({
      success: true,
    }),
    onRefresh: () =>
      new Promise<void>((resolve) => {
        events.push("refresh:start");
        resolveRefresh = () => {
          events.push("refresh:done");
          resolve();
        };
      }),
    onError: (message) => {
      events.push(`error:${message ?? "null"}`);
    },
    onSuccess: (message) => {
      events.push(`success:${message ?? "null"}`);
    },
    successMessage: "products-ok",
    errorFallback: "products-failed",
  });

  let settled = false;
  void mutationPromise.then(() => {
    settled = true;
  });

  await Promise.resolve();

  assert.deepEqual(events, ["success:products-ok", "refresh:start"]);
  assert.equal(settled, false);

  resolveRefresh?.();
  await mutationPromise;

  assert.equal(settled, true);
  assert.deepEqual(events, ["success:products-ok", "refresh:start", "refresh:done"]);
});

test("performAdminSecretProductMutation reports API errors without refreshing", async () => {
  const events: string[] = [];

  const didSucceed = await performAdminSecretProductMutation({
    request: async () => ({
      success: false,
      error: "import failed",
    }),
    onRefresh: async () => {
      events.push("refresh");
    },
    onError: (message) => {
      events.push(`error:${message ?? "null"}`);
    },
    onSuccess: (message) => {
      events.push(`success:${message ?? "null"}`);
    },
    successMessage: "products-ok",
    errorFallback: "products-failed",
  });

  assert.equal(didSucceed, false);
  assert.deepEqual(events, ["error:import failed"]);
});

test("normalizeInventoryProductId auto-selects and normalizes invalid selection", () => {
  const products = [
    {
      id: "product-1",
      name: "Provider Pack",
      description: "Secret credential",
      productType: "SECRET_CREDENTIAL" as const,
      price: 300,
      currencyType: "POINTS" as const,
      isActive: true,
      displayConfig: { providerLabel: "Provider" },
      fulfillmentConfig: { allowRepeatPurchase: true },
      inventoryCount: 2,
      orderCount: 1,
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
    },
    {
      id: "product-2",
      name: "Backup Pack",
      description: "Second secret credential",
      productType: "SECRET_CREDENTIAL" as const,
      price: 500,
      currencyType: "POINTS" as const,
      isActive: false,
      displayConfig: { providerLabel: "Backup" },
      fulfillmentConfig: { allowRepeatPurchase: false },
      inventoryCount: 0,
      orderCount: 0,
      createdAt: "2026-04-02T00:00:00.000Z",
      updatedAt: "2026-04-02T00:00:00.000Z",
    },
  ];

  assert.equal(normalizeInventoryProductId(products, ""), "product-1");
  assert.equal(normalizeInventoryProductId(products, "product-2"), "product-2");
  assert.equal(normalizeInventoryProductId(products, "missing"), "product-1");
  assert.equal(normalizeInventoryProductId([], "product-1"), "");
});

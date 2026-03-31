import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createAdminShopRequestTracker, loadAdminShopItems } from "./page";
import { AdminShopPanel, performAdminShopMutation } from "./admin-shop-panel";

test("AdminShopPanel renders create form and inactive item state", () => {
  const html = renderToStaticMarkup(
    <AdminShopPanel
      t={(key) => key}
      items={[
        {
          id: "crown",
          name: "Crown",
          description: "Royal",
          type: "hat",
          category: "hat",
          price: 200,
          spriteKey: "crown",
          isActive: false,
          purchaseCount: 3,
        },
      ]}
      loading={false}
      busyItemId={null}
      onRefresh={() => Promise.resolve()}
      onError={() => undefined}
      onSuccess={() => undefined}
    />
  );

  assert.match(html, /admin\.shop\.createTitle/);
  assert.match(html, /admin\.shop\.status\.inactive/);
  assert.match(html, /3/);
});

test("performAdminShopMutation stays pending until refresh finishes", async () => {
  const events: string[] = [];
  let resolveRefresh: (() => void) | null = null;

  const mutationPromise = performAdminShopMutation({
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
    successMessage: "shop-ok",
    errorFallback: "shop-failed",
  });

  let settled = false;
  void mutationPromise.then(() => {
    settled = true;
  });

  await Promise.resolve();

  assert.deepEqual(events, ["success:shop-ok", "refresh:start"]);
  assert.equal(settled, false);

  resolveRefresh?.();
  await mutationPromise;

  assert.equal(settled, true);
  assert.deepEqual(events, ["success:shop-ok", "refresh:start", "refresh:done"]);
});

test("loadAdminShopItems clears stale errors before and after a successful load", async () => {
  const errorMessages: Array<string | null> = [];
  const loadingStates: boolean[] = [];
  let receivedItems: unknown[] | null = null;

  await loadAdminShopItems({
    fetchImpl: async () => ({
      json: async () => ({
        success: true,
        data: [
          {
            id: "crown",
            name: "Crown",
            description: "Royal",
            type: "hat",
            category: "hat",
            price: 200,
            spriteKey: "crown",
            isActive: true,
            purchaseCount: 3,
          },
        ],
      }),
    }),
    setItems: (items) => {
      receivedItems = items;
    },
    setError: (message) => {
      errorMessages.push(message);
    },
    setLoading: (value) => {
      loadingStates.push(value);
    },
    t: (key) => key,
    isCancelled: () => false,
  });

  assert.equal(Array.isArray(receivedItems), true);
  assert.deepEqual(errorMessages, [null, null]);
  assert.deepEqual(loadingStates, [true, false]);
});

test("createAdminShopRequestTracker invalidates an earlier request after cancellation", () => {
  const tracker = createAdminShopRequestTracker();
  const firstRequestCancelled = tracker.beginRequest();

  assert.equal(firstRequestCancelled(), false);

  tracker.cancelPending();

  assert.equal(firstRequestCancelled(), true);
});

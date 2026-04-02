import assert from "node:assert/strict";
import test from "node:test";

import en from "./en";
import zh from "./zh";

test("shop translations no longer expose interactive balance-era copy", () => {
  const obsoleteKeys = [
    "shop.subtitle",
    "shop.authRequired",
    "shop.balance",
  ] as const;

  for (const key of obsoleteKeys) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(zh, key),
      false,
      `expected zh to omit ${key}`
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(en, key),
      false,
      `expected en to omit ${key}`
    );
  }

  assert.equal(
    Object.prototype.hasOwnProperty.call(zh, "control.shopReadOnly"),
    true
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(en, "control.shopReadOnly"),
    true
  );
});

test("admin shop translation keys exist in both locales", () => {
  const requiredKeys = [
    "admin.shop.title",
    "admin.shop.createTitle",
    "admin.shop.status.active",
    "admin.shop.status.inactive",
    "admin.shop.purchaseCount",
    "admin.shop.action.activate",
    "admin.shop.action.deactivate",
  ] as const;

  for (const key of requiredKeys) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(zh, key),
      true,
      `expected zh to include ${key}`
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(en, key),
      true,
      `expected en to include ${key}`
    );
  }
});

test("admin secret product translation keys exist in both locales", () => {
  const requiredKeys = [
    "admin.products.title",
    "admin.products.createTitle",
    "admin.products.form.providerLabel",
    "admin.products.form.usageInstructions",
    "admin.products.inventory.title",
    "admin.products.inventory.secrets",
    "admin.products.inventory.importSuccess",
  ] as const;

  for (const key of requiredKeys) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(zh, key),
      true,
      `expected zh to include ${key}`
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(en, key),
      true,
      `expected en to include ${key}`
    );
  }
});

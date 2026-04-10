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

test("zh shop quota copy uses API quota and pending-fulfillment wording", () => {
  assert.match(zh["shop.emptyDescription"], /装扮|API 额度商品/);
  assert.match(zh["shop.emptyDescription"], /管理员履约/);

  assert.match(zh["shop.filter.secretProducts"], /API 额度/);
  assert.doesNotMatch(zh["shop.filter.secretProducts"], /密钥商品|秘密商品/);

  assert.match(zh["shop.secretProducts.readOnlyHint"], /仅供浏览|筛选/);
  assert.match(zh["shop.secretProducts.readOnlyHint"], /待处理|管理员履约/);
  assert.doesNotMatch(zh["shop.secretProducts.readOnlyHint"], /库存|即时发放/);

  assert.match(zh["shop.secret.agentOnlyReadOnly"], /Agent API|待管理员履约/);
  assert.doesNotMatch(zh["shop.secret.agentOnlyReadOnly"], /库存|即时发放/);
});

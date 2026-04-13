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
    "admin.products.orders.fulfilledTitle",
    "admin.products.orders.fulfilledSubtitle",
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

test("shop quota copy is pinned in zh and en dictionaries", () => {
  assert.equal(
    zh["shop.emptyDescription"],
    "先在公开目录上架装扮或 API 额度商品，再让已连接 Agent 通过 API 购买；订单将在管理员履约后生效。"
  );
  assert.equal(
    en["shop.emptyDescription"],
    "Add cosmetics or API quota products to the public catalog, then have connected agents purchase through the API and wait for admin fulfillment."
  );

  assert.equal(zh["shop.filter.secretProducts"], "API 额度");
  assert.equal(en["shop.filter.secretProducts"], "API Quota");

  assert.equal(
    zh["shop.secretProducts.readOnlyHint"],
    "API 额度商品在公开商店仅供浏览与筛选。购买需由已连接 Agent 调用 API 提交，额度订单会在管理员履约前保持待处理。"
  );
  assert.equal(
    en["shop.secretProducts.readOnlyHint"],
    "API quota products are browse-only in the public storefront. Purchases must be submitted by a connected agent via API and stay pending until admin fulfillment."
  );

  assert.equal(zh["shop.secret.oneTimeVisible"], "单次额度订单");
  assert.equal(en["shop.secret.oneTimeVisible"], "Single quota order");

  assert.equal(
    zh["shop.secret.agentOnlyReadOnly"],
    "API 额度商品仅支持 Agent API 购买，订单提交后将处于待管理员履约状态。本页面仅用于展示。"
  );
  assert.equal(
    en["shop.secret.agentOnlyReadOnly"],
    "API quota products can only be purchased through the agent API. Each order remains pending admin fulfillment while this storefront stays read-only."
  );

  assert.equal(
    zh["admin.products.orders.subtitle"],
    "查看 API 额度订单、购买方与履约时间戳。"
  );
  assert.equal(
    en["admin.products.orders.subtitle"],
    "Review API quota orders with buyer details and fulfillment timestamps."
  );

  assert.equal(
    zh["admin.products.keys.subtitle"],
    "维护管理员提供的 API Key，供账号绑定流程复用，并在额度订单履约时选择。"
  );
  assert.equal(
    en["admin.products.keys.subtitle"],
    "Manage admin-provided API keys reused by account-binding flows and selected during quota-order fulfillment."
  );

  assert.doesNotMatch(zh["shop.filter.secretProducts"], /密钥商品|秘密商品/);
  assert.doesNotMatch(en["shop.emptyDescription"], /secret products/i);
  assert.doesNotMatch(en["shop.secretProducts.readOnlyHint"], /inventory|instant/i);
});

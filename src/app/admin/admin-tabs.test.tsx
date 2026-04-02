import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AdminPrimaryTabs, normalizeAdminPrimaryTab } from "./admin-tabs";

test("normalizeAdminPrimaryTab falls back to forum for unsupported values", () => {
  assert.equal(normalizeAdminPrimaryTab(undefined), "forum");
  assert.equal(normalizeAdminPrimaryTab(null), "forum");
  assert.equal(normalizeAdminPrimaryTab("products"), "products");
  assert.equal(normalizeAdminPrimaryTab("shop"), "shop");
  assert.equal(normalizeAdminPrimaryTab("site"), "site");
  assert.equal(normalizeAdminPrimaryTab("knowledge"), "knowledge");
  assert.equal(normalizeAdminPrimaryTab("unknown"), "forum");
});

test("AdminPrimaryTabs renders forum, products, shop, site controls, and knowledge tabs", () => {
  const html = renderToStaticMarkup(
    <AdminPrimaryTabs
      activeTab="shop"
      labels={{
        forum: "内容审核",
        products: "密钥商品",
        shop: "商店管理",
        site: "站点访问控制",
        knowledge: "知识库管理",
      }}
      onChange={() => undefined}
    />
  );

  assert.match(html, /内容审核/);
  assert.match(html, /密钥商品/);
  assert.match(html, /商店管理/);
  assert.match(html, /站点访问控制/);
  assert.match(html, /知识库管理/);
  assert.match(html, /aria-pressed="true"/);
});

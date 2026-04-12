import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/i18n";
import { ItemDrawer } from "./item-drawer";
import type {
  ShopItemCosmeticData,
  ShopItemSecretProductData,
} from "./utils";

const sampleItem = {
  entryType: "cosmetic",
  id: "crown",
  name: "Crown",
  description: "A royal crown for the top agent",
  type: "hat",
  category: "hat",
  price: 200,
  spriteKey: "crown",
} satisfies ShopItemCosmeticData;

const secretItem = {
  entryType: "api_quota_product",
  id: "s1",
  name: "Quota Pack",
  description: "API quota",
  price: 900,
  detail: {
    providerLabel: "Vault",
    usageInstructions: "Use it in the vault",
    quotaAmount: 20000,
    quotaUnitLabel: "tokens",
    allowRepeatPurchase: false,
    perAgentPurchaseLimit: 1,
  },
} satisfies ShopItemSecretProductData;

test("ItemDrawer renders nothing when item is null", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemDrawer item={null} onClose={() => {}} />
    </LocaleProvider>
  );

  assert.equal(html, "");
});

test("ItemDrawer renders item details when item is provided", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemDrawer item={sampleItem} onClose={() => {}} />
    </LocaleProvider>
  );

  assert.match(html, /Crown/);
  assert.match(html, /A royal crown/);
  assert.match(html, /200/);
});

test("ItemDrawer renders a large canvas preview", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemDrawer item={sampleItem} onClose={() => {}} />
    </LocaleProvider>
  );

  assert.match(html, /<canvas/);
  assert.match(html, /width="160"/);
  assert.match(html, /height="160"/);
});

test("ItemDrawer renders category and type info", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemDrawer item={sampleItem} onClose={() => {}} />
    </LocaleProvider>
  );

  assert.match(html, /帽子|Hats/);
});

test("ItemDrawer renders the agent purchase hint with balance, inventory, and itemId guidance", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemDrawer item={sampleItem} onClose={() => {}} />
    </LocaleProvider>
  );

  assert.match(html, /GET \/api\/agent\/points\/balance/);
  assert.match(html, /GET \/api\/agent\/inventory/);
  assert.match(html, /POST \/api\/agent\/shop\/purchase/);
  assert.match(html, /PUT \/api\/agent\/equipment/);
  assert.match(html, /itemId/);
});

test("ItemDrawer renders quota-product usage instructions and pending-fulfillment guidance", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemDrawer item={secretItem} onClose={() => {}} />
    </LocaleProvider>
  );

  assert.match(html, /20000 tokens/);
  assert.match(html, /履约说明|Fulfillment/);
  assert.match(html, /购买规则|Purchase policy/);
  assert.match(html, /仅支持 Agent API 购买|Agent API/);
  assert.match(html, /待管理员履约状态|pending admin fulfillment/);
  assert.match(html, /单次额度订单|Single quota order/);
  assert.match(html, /每个 Agent 最多 1 单|Up to 1 order per agent/);
  assert.match(html, /使用说明/);
  assert.match(html, /Use it in the vault/);
  assert.doesNotMatch(html, /Vault/);
  assert.doesNotMatch(html, /库存/);
});

test("ItemDrawer renders repeat-purchase policy with no published per-agent cap", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemDrawer
        item={{
          entryType: "api_quota_product",
          id: "s2",
          name: "Team Pool",
          description: "Shared reserve",
          price: 1600,
          detail: {
            providerLabel: "OpenRouter",
            usageInstructions: null,
            quotaAmount: 40000,
            quotaUnitLabel: "credits",
            allowRepeatPurchase: true,
            perAgentPurchaseLimit: null,
          },
        }}
        onClose={() => {}}
      />
    </LocaleProvider>
  );

  assert.match(html, /支持重复购买|Repeat purchase allowed/);
  assert.match(html, /未设置公开的每 Agent 限额|No published per-agent cap/);
  assert.doesNotMatch(html, /单次额度订单|Single quota order/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/i18n";
import { ItemCard } from "./item-card";
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

const sampleColorItem = {
  entryType: "cosmetic",
  id: "orange",
  name: "Orange Shell",
  description: "A bright orange lobster shell",
  type: "color",
  category: "skin",
  price: 50,
  spriteKey: "orange",
} satisfies ShopItemCosmeticData;

const secretItem = {
  entryType: "api_quota_product",
  id: "s1",
  name: "Quota Pack",
  description: "Extra throughput for vault-backed agent calls",
  price: 900,
  detail: {
    providerLabel: "Vault",
    usageInstructions: "Use it in the vault",
    quotaAmount: 10000,
    quotaUnitLabel: "tokens",
    allowRepeatPurchase: false,
    perAgentPurchaseLimit: 1,
  },
} satisfies ShopItemSecretProductData;

test("ItemCard renders item name, description, and price", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemCard item={sampleItem} onClick={() => {}} />
    </LocaleProvider>
  );

  assert.match(html, /Crown/);
  assert.match(html, /A royal crown/);
  assert.match(html, /200/);
});

test("ItemCard renders a canvas preview element", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemCard item={sampleItem} onClick={() => {}} />
    </LocaleProvider>
  );

  assert.match(html, /<canvas/);
});

test("ItemCard shifts cosmetic preview content upward to avoid a white strip above shell items", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemCard item={sampleColorItem} onClick={() => {}} />
    </LocaleProvider>
  );

  assert.match(html, /pt-3 pb-7/);
});

test("ItemCard renders category badge", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemCard item={sampleItem} onClick={() => {}} />
    </LocaleProvider>
  );

  assert.match(html, /帽子|Hats/);
});

test("ItemCard renders compact description and policy signals for quota products", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemCard item={secretItem} onClick={() => {}} />
    </LocaleProvider>
  );

  assert.match(html, /Extra throughput for vault-backed agent calls/);
  assert.match(html, /10000 tokens/);
  assert.match(html, /单次额度订单|Single quota order/);
  assert.match(html, /每个 Agent 最多 1 单|Up to 1 order per agent/);
  assert.doesNotMatch(html, /Vault/);
  assert.doesNotMatch(html, /库存/);
});

test("ItemCard does not render lobster preview for secret products", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemCard item={secretItem} onClick={() => {}} />
    </LocaleProvider>
  );

  assert.doesNotMatch(html, /<canvas/);
});

test("ItemCard keeps quota-product cards compact by excluding drawer-only fulfillment copy", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemCard item={secretItem} onClick={() => {}} />
    </LocaleProvider>
  );

  assert.doesNotMatch(html, /履约说明|Fulfillment/);
});

test("ItemCard renders repeat-purchase quota policy with plural-safe english limit copy", () => {
  const originalWindow = (globalThis as any).window;
  (globalThis as any).window = {
    localStorage: {
      getItem: () => "en",
    },
  };

  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemCard
        item={{
          entryType: "api_quota_product",
          id: "s2",
          name: "Flexible Pack",
          description: "Burst quota for shared workflows",
          price: 1200,
          detail: {
            providerLabel: "OpenRouter",
            usageInstructions: null,
            quotaAmount: 25000,
            quotaUnitLabel: "credits",
            allowRepeatPurchase: true,
            perAgentPurchaseLimit: 2,
          },
        }}
        onClick={() => {}}
      />
    </LocaleProvider>
  );

  if (originalWindow === undefined) {
    delete (globalThis as any).window;
  } else {
    (globalThis as any).window = originalWindow;
  }

  assert.match(html, /Repeat purchase allowed/);
  assert.match(html, /Up to 2 purchases per agent/);
  assert.doesNotMatch(html, /Single quota order/);
});

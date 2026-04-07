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

const secretItem = {
  entryType: "secret_product",
  id: "s1",
  name: "Secret Credential",
  description: "Top secret",
  price: 900,
  detail: {
    providerLabel: null,
    usageInstructions: "Use it in the vault",
    isInStock: false,
    availableInventoryCount: 0,
    allowRepeatPurchase: false,
    perAgentPurchaseLimit: null,
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

test("ItemCard renders category badge", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemCard item={sampleItem} onClick={() => {}} />
    </LocaleProvider>
  );

  assert.match(html, /帽子|Hats/);
});

test("ItemCard renders provider and stock state for secret products", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemCard item={secretItem} onClick={() => {}} />
    </LocaleProvider>
  );

  assert.match(html, /未知供应商|Unknown provider/);
  assert.match(html, /已售罄|Sold out/);
  assert.match(html, /一次可见|One-time secret/);
});

test("ItemCard does not render lobster preview for secret products", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemCard item={secretItem} onClick={() => {}} />
    </LocaleProvider>
  );

  assert.doesNotMatch(html, /<canvas/);
});

test("ItemCard keeps secret-product details out of the compact card body", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ItemCard item={secretItem} onClick={() => {}} />
    </LocaleProvider>
  );

  assert.doesNotMatch(html, /Top secret/);
});

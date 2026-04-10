import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import ShopPage from "./page";
import {
  filterAndSortCatalogEntries,
  getTypeCounts,
  mapCatalogEntryToItemData,
} from "./page-helpers";
import { LocaleProvider } from "@/i18n";
import { CategoryTabs } from "@/components/shop/category-tabs";
import type { PublicShopCatalogEntry } from "@/lib/shop-client";

test("shop page renders a read-only header without the balance card", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ShopPage />
    </LocaleProvider>
  );

  assert.match(html, /商店/);
  assert.match(html, /商店页面当前只展示公开目录/);
  assert.doesNotMatch(
    html,
    /密钥商品在公开商店中只用于展示与筛选，不提供网页端购买。请让已连接 Agent 调用接口完成购买与发放。/
  );
  assert.doesNotMatch(html, /当前余额/);
});

test("shop page does not render the empty-state seeding hint on initial empty content", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ShopPage />
    </LocaleProvider>
  );

  assert.doesNotMatch(html, /先执行种子数据或创建公开目录条目/);
  assert.doesNotMatch(html, /Seed the public catalog/);
});

test("shop page category tabs exposes product-type filters", () => {
  const html = renderToStaticMarkup(
    <CategoryTabs
      active="all"
      onTabChange={() => {}}
      search=""
      onSearchChange={() => {}}
      counts={{ all: 3, cosmetics: 2, secretProducts: 1 }}
      t={(key) => key}
    />
  );

  assert.match(html, /shop\.filter\.all/);
  assert.match(html, /shop\.filter\.cosmetics/);
  assert.match(html, /shop\.filter\.secretProducts/);
});

function isReactElement(value: unknown): value is {
  type: unknown;
  props?: { children?: unknown };
} {
  return Boolean(value) && typeof value === "object" && "type" in (value as any);
}

function flattenReactElements(root: unknown): Array<{ type: any; props: any }> {
  const out: Array<{ type: any; props: any }> = [];
  const queue: unknown[] = [root];

  while (queue.length) {
    const node = queue.shift();
    if (Array.isArray(node)) {
      queue.push(...node);
      continue;
    }
    if (!isReactElement(node)) continue;

    const el = node as any;
    out.push({ type: el.type, props: el.props ?? {} });
    if (el.props?.children !== undefined) queue.push(el.props.children);
  }

  return out;
}

function elementText(node: unknown): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(elementText).join("");
  if (!isReactElement(node)) return "";
  return elementText((node as any).props?.children);
}

test("shop page category tabs wires tab switching and search input", () => {
  const seenTabs: string[] = [];
  const seenSearch: string[] = [];

  const tree = CategoryTabs({
    active: "all",
    onTabChange: (tab) => seenTabs.push(tab),
    search: "",
    onSearchChange: (value) => seenSearch.push(value),
    counts: { all: 3, cosmetics: 2, secretProducts: 1 },
    t: (key) => key,
  });

  const elements = flattenReactElements(tree);
  const buttons = elements
    .filter((el) => el.type === "button")
    .map((el) => ({ ...el, text: elementText(el) }));

  const cosmeticsButton = buttons.find((b) =>
    b.text.includes("shop.filter.cosmetics")
  );
  assert.ok(cosmeticsButton);
  cosmeticsButton.props.onClick();

  const secretButton = buttons.find((b) =>
    b.text.includes("shop.filter.secretProducts")
  );
  assert.ok(secretButton);
  secretButton.props.onClick();

  const input = elements.find((el) => el.type === "input");
  assert.ok(input);
  input.props.onChange({ target: { value: "lobster" } });

  assert.deepEqual(seenTabs, ["cosmetics", "secretProducts"]);
  assert.deepEqual(seenSearch, ["lobster"]);
});

test("shop page filter wiring applies search and tab selections", () => {
  const seenTabs: string[] = [];
  const seenSearch: string[] = [];
  const catalog: PublicShopCatalogEntry[] = [
    {
      entryType: "cosmetic",
      id: "c1",
      name: "Alpha Hat",
      description: "A hat",
      price: 10,
      currencyType: "POINTS",
      type: "hat",
      category: "hat",
      spriteKey: "hat-1",
    },
    {
      entryType: "api_quota_product",
      id: "s1",
      name: "Quota Pack",
      description: "Top secret",
      price: 99,
      currencyType: "POINTS",
      providerLabel: "Provider",
      usageInstructions: null,
      quotaAmount: 10000,
      quotaUnitLabel: "tokens",
      allowRepeatPurchase: false,
      perAgentPurchaseLimit: null,
    },
  ];

  const tree = CategoryTabs({
    active: "all",
    onTabChange: (tab) => seenTabs.push(tab),
    search: "",
    onSearchChange: (value) => seenSearch.push(value),
    counts: { all: 2, cosmetics: 1, secretProducts: 1 },
    t: (key) => key,
  });

  const elements = flattenReactElements(tree);
  const buttons = elements
    .filter((el) => el.type === "button")
    .map((el) => ({ ...el, text: elementText(el) }));
  const secretButton = buttons.find((b) =>
    b.text.includes("shop.filter.secretProducts")
  );
  assert.ok(secretButton);
  secretButton.props.onClick();

  const input = elements.find((el) => el.type === "input");
  assert.ok(input);
  input.props.onChange({ target: { value: "secret" } });

  const filtered = filterAndSortCatalogEntries({
    catalog,
    activeTab: seenTabs.at(-1) ?? "all",
    search: seenSearch.at(-1) ?? "",
    sort: "price-asc",
  });

  assert.deepEqual(filtered.map((item) => item.id), ["s1"]);
});

test("shop page filtering helper supports type filtering, search, and sorting", () => {
  const catalog: PublicShopCatalogEntry[] = [
    {
      entryType: "cosmetic",
      id: "c1",
      name: "Alpha Hat",
      description: "A hat",
      price: 10,
      currencyType: "POINTS",
      type: "hat",
      category: "hat",
      spriteKey: "hat-1",
    },
    {
      entryType: "cosmetic",
      id: "c2",
      name: "Beta Skin",
      description: "A shell",
      price: 5,
      currencyType: "POINTS",
      type: "color",
      category: "skin",
      spriteKey: "blue",
    },
    {
      entryType: "api_quota_product",
      id: "s1",
      name: "Quota Pack",
      description: "Top secret",
      price: 99,
      currencyType: "POINTS",
      providerLabel: "Provider",
      usageInstructions: null,
      quotaAmount: 10000,
      quotaUnitLabel: "tokens",
      allowRepeatPurchase: false,
      perAgentPurchaseLimit: null,
    },
  ];

  const cosmetics = filterAndSortCatalogEntries({
    catalog,
    activeTab: "cosmetics",
    search: "",
    sort: "price-asc",
  });
  assert.equal(cosmetics.length, 2);
  assert.equal(cosmetics[0]?.id, "c2");

  const searchHat = filterAndSortCatalogEntries({
    catalog,
    activeTab: "all",
    search: "hat",
    sort: "price-asc",
  });
  assert.deepEqual(searchHat.map((item) => item.id), ["c1"]);

  const nameSorted = filterAndSortCatalogEntries({
    catalog,
    activeTab: "cosmetics",
    search: "",
    sort: "name-asc",
  });
  assert.deepEqual(nameSorted.map((item) => item.id), ["c1", "c2"]);
});

test("shop page filtering helper matches quota products by provider label and quota unit metadata", () => {
  const catalog: PublicShopCatalogEntry[] = [
    {
      entryType: "api_quota_product",
      id: "s1",
      name: "Team Burst Pack",
      description: "Higher daily allowance",
      price: 99,
      currencyType: "POINTS",
      providerLabel: "OpenRouter",
      usageInstructions: null,
      quotaAmount: 5000,
      quotaUnitLabel: "credits",
      allowRepeatPurchase: true,
      perAgentPurchaseLimit: null,
    },
    {
      entryType: "cosmetic",
      id: "c1",
      name: "Coral Cap",
      description: "Ocean style",
      price: 12,
      currencyType: "POINTS",
      type: "hat",
      category: "hat",
      spriteKey: "cap-1",
    },
  ];

  const providerMatch = filterAndSortCatalogEntries({
    catalog,
    activeTab: "all",
    search: "openrouter",
    sort: "price-asc",
  });
  assert.deepEqual(providerMatch.map((item) => item.id), ["s1"]);

  const unitMatch = filterAndSortCatalogEntries({
    catalog,
    activeTab: "all",
    search: "credits",
    sort: "price-asc",
  });
  assert.deepEqual(unitMatch.map((item) => item.id), ["s1"]);
});

test("shop page filtering helper does not throw if description is nullish at runtime", () => {
  const catalog = [
    {
      entryType: "cosmetic",
      id: "c1",
      name: "Alpha",
      // Simulate backend inconsistencies without changing production types.
      description: undefined,
      price: 1,
      currencyType: "POINTS",
      type: "hat",
      category: "hat",
      spriteKey: "hat-1",
    },
  ] as any;

  assert.doesNotThrow(() =>
    filterAndSortCatalogEntries({
      catalog,
      activeTab: "all",
      search: "a",
      sort: "price-asc",
    })
  );
});

test("shop page catalog item mapping tolerates nullish descriptions", () => {
  const entry = {
    entryType: "api_quota_product",
    id: "s1",
    name: "Secret",
    description: null,
    price: 2,
    currencyType: "POINTS",
    providerLabel: null,
    usageInstructions: null,
    quotaAmount: 10000,
    quotaUnitLabel: "tokens",
    allowRepeatPurchase: false,
    perAgentPurchaseLimit: null,
  } as any;

  const mapped = mapCatalogEntryToItemData(entry);
  assert.equal(mapped.description, "");
});

test("shop page type counting does not treat unknown entryType values as secret products", () => {
  const catalog = [
    {
      entryType: "cosmetic",
      id: "c1",
      name: "Alpha",
      description: "desc",
      price: 1,
      currencyType: "POINTS",
      type: "hat",
      category: "hat",
      spriteKey: "hat-1",
    },
    {
      entryType: "api_quota_product",
      id: "s1",
      name: "Secret",
      description: "desc",
      price: 2,
      currencyType: "POINTS",
      providerLabel: null,
      usageInstructions: null,
      quotaAmount: 10000,
      quotaUnitLabel: "tokens",
      allowRepeatPurchase: false,
      perAgentPurchaseLimit: null,
    },
    {
      entryType: "something_else",
      id: "x1",
      name: "Weird",
      description: "desc",
      price: 3,
      currencyType: "POINTS",
    },
  ] as any;

  const counts = getTypeCounts(catalog);
  assert.deepEqual(counts, { all: 3, cosmetics: 1, secretProducts: 1 });
});

test("shop page renders loading skeleton on initial render", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ShopPage />
    </LocaleProvider>
  );

  // Should have skeleton placeholders (animate-pulse)
  assert.match(html, /animate-pulse/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider, useT } from "@/i18n";
import {
  CategoryTabs,
  type ShopProductTypeCounts,
  type ShopProductTypeFilter,
} from "./category-tabs";

function Harness(props: {
  active: ShopProductTypeFilter;
  onTabChange: (tab: ShopProductTypeFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
  counts: ShopProductTypeCounts;
}) {
  const t = useT();
  return <CategoryTabs {...props} t={t} />;
}

const sampleCounts: ShopProductTypeCounts = {
  all: 12,
  cosmetics: 7,
  secretProducts: 5,
};

test("CategoryTabs renders all tab options with counts", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <Harness
        active="all"
        onTabChange={() => {}}
        search=""
        onSearchChange={() => {}}
        counts={sampleCounts}
      />
    </LocaleProvider>
  );

  assert.match(html, /全部/);
  assert.match(html, /12/);
  assert.match(html, /装扮/);
  assert.match(html, /7/);
  assert.match(html, /秘密商品/);
  assert.match(html, /5/);
});

test("CategoryTabs renders a search input", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <Harness
        active="all"
        onTabChange={() => {}}
        search=""
        onSearchChange={() => {}}
        counts={sampleCounts}
      />
    </LocaleProvider>
  );

  assert.match(html, /<input/);
  assert.match(html, /type="text"/);
});

test("CategoryTabs highlights active tab", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <Harness
        active="secretProducts"
        onTabChange={() => {}}
        search=""
        onSearchChange={() => {}}
        counts={sampleCounts}
      />
    </LocaleProvider>
  );

  assert.match(html, /bg-accent\/15/);
});

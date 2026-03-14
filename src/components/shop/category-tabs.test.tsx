import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider, useT } from "@/i18n";
import { CategoryTabs } from "./category-tabs";

function Harness(props: {
  active: string;
  onTabChange: (tab: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  counts: Record<string, number>;
}) {
  const t = useT();
  return <CategoryTabs {...props} t={t} />;
}

test("CategoryTabs renders all tab options with counts", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <Harness
        active="all"
        onTabChange={() => {}}
        search=""
        onSearchChange={() => {}}
        counts={{ all: 12, skin: 5, hat: 4, accessory: 3 }}
      />
    </LocaleProvider>
  );

  assert.match(html, /全部/);
  assert.match(html, /12/);
  assert.match(html, /外壳/);
  assert.match(html, /5/);
  assert.match(html, /帽子/);
  assert.match(html, /4/);
  assert.match(html, /饰品/);
  assert.match(html, /3/);
});

test("CategoryTabs renders a search input", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <Harness
        active="all"
        onTabChange={() => {}}
        search=""
        onSearchChange={() => {}}
        counts={{ all: 12, skin: 5, hat: 4, accessory: 3 }}
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
        active="hat"
        onTabChange={() => {}}
        search=""
        onSearchChange={() => {}}
        counts={{ all: 12, skin: 5, hat: 4, accessory: 3 }}
      />
    </LocaleProvider>
  );

  assert.match(html, /bg-accent\/15/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import ShopPage, { ShopCatalogContent } from "./page";
import { LocaleProvider, useT } from "@/i18n";

function ShopCatalogContentHarness(props: {
  items: Array<{
    id: string;
    name: string;
    description: string;
    type: string;
    category: string;
    price: number;
    spriteKey: string;
  }>;
  loading: boolean;
  error: string | null;
}) {
  const t = useT();
  return <ShopCatalogContent {...props} t={t} />;
}

test("shop page shows an empty state when the catalog has no items", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ShopCatalogContentHarness items={[]} loading={false} error={null} />
    </LocaleProvider>
  );

  assert.match(html, /商店里还没有可用物品。/);
});

test("shop item cards do not render a prompt wiki button", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ShopCatalogContentHarness
        items={[
          {
            id: "item-1",
            name: "Neon Cap",
            description: "A bright hat for verified agents.",
            type: "cosmetic",
            category: "hat",
            price: 120,
            spriteKey: "neon-cap",
          },
        ]}
        loading={false}
        error={null}
      />
    </LocaleProvider>
  );

  assert.match(html, /Neon Cap/);
  assert.match(html, /A bright hat for verified agents\./);
  assert.doesNotMatch(html, /查看 Prompt Wiki/);
});

test("shop page renders the shared header with balance summary", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ShopPage />
    </LocaleProvider>
  );

  assert.match(html, /商店/);
  assert.match(
    html,
    /商店页面当前只展示公开目录。涉及 Agent 身份的购买和装备动作不再由网页直接触发。/
  );
  assert.match(html, /余额/);
});

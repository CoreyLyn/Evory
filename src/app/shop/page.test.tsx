import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ShopCatalogContent } from "./page";
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

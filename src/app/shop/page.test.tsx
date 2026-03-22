import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import ShopPage from "./page";
import { LocaleProvider } from "@/i18n";

test("shop page renders a read-only header without the balance card", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ShopPage />
    </LocaleProvider>
  );

  assert.match(html, /商店/);
  assert.match(html, /商店页面当前只展示公开目录/);
  assert.doesNotMatch(html, /当前余额/);
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

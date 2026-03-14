import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import ShopPage from "./page";
import { LocaleProvider } from "@/i18n";

test("shop page renders header with title and balance card", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ShopPage />
    </LocaleProvider>
  );

  assert.match(html, /商店/);
  assert.match(html, /余额/);
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

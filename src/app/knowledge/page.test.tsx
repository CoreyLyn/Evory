import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import KnowledgePage from "./page";
import { LocaleProvider } from "@/i18n";

function renderPage(page: React.ReactElement) {
  return renderToStaticMarkup(<LocaleProvider>{page}</LocaleProvider>);
}

test("knowledge page keeps the search shell compact across breakpoints", () => {
  const html = renderPage(<KnowledgePage />);

  assert.match(
    html,
    /<form[^>]*class="[^"]*\bw-full\b[^"]*\bmax-w-\[18rem\][^"]*\bsm:w-auto\b[^"]*\bsm:max-w-\[20rem\][^"]*"/
  );
  assert.match(
    html,
    /type="search"[^>]*class="[^"]*\bmin-w-0\b[^"]*\bflex-1\b[^"]*"/
  );
});

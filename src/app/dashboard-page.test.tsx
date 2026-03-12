import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import DashboardPage from "./dashboard/page";
import { LocaleProvider } from "@/i18n";

function renderPage(page: React.ReactElement) {
  return renderToStaticMarkup(<LocaleProvider>{page}</LocaleProvider>);
}

test("dashboard page remains available at /dashboard", () => {
  const html = renderPage(<DashboardPage />);

  assert.match(html, /仪表盘/);
  assert.match(html, /论坛帖子/);
  assert.match(html, /知识文档/);
  assert.doesNotMatch(html, /知识文章/);
});

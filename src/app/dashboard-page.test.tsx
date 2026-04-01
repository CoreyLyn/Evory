import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import DashboardPage from "./dashboard/page";
import { LocaleProvider } from "@/i18n";
import { DashboardProvider } from "@/lib/dashboard-context";

function renderPage(page: React.ReactElement) {
  return renderToStaticMarkup(
    <LocaleProvider>
      <DashboardProvider>{page}</DashboardProvider>
    </LocaleProvider>
  );
}

test("dashboard page remains available at /dashboard", () => {
  const html = renderPage(<DashboardPage />);

  assert.match(html, /仪表盘/);
  assert.match(html, /论坛帖子/);
  assert.match(html, /知识文档/);
  assert.doesNotMatch(html, /知识文章/);
});

test("dashboard page includes StatsGrid", () => {
  const html = renderPage(<DashboardPage />);
  assert.match(html, /Agent 总数/);
  assert.match(html, /当前在线/);
});

test("dashboard page includes LeaderboardCard", () => {
  const html = renderPage(<DashboardPage />);
  assert.match(html, /积分排行榜/);
});

test("dashboard page includes QuickLinks", () => {
  const html = renderPage(<DashboardPage />);
  assert.match(html, /办公室/);
  assert.match(html, /论坛/);
  assert.match(html, /知识库/);
  assert.match(html, /任务/);
});
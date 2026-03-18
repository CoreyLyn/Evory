import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import ForumPage from "./forum/page";
import TasksPage from "./tasks/page";
import ShopPage from "./shop/page";
import { LocaleProvider } from "@/i18n";

function renderPage(page: React.ReactElement) {
  return renderToStaticMarkup(<LocaleProvider>{page}</LocaleProvider>);
}

test("forum list page keeps only the read-only hint in the shell", async () => {
  const page = await ForumPage({
    searchParams: Promise.resolve({}),
  });
  const html = renderPage(page);

  assert.match(html, /论坛/);
  assert.match(
    html,
    /论坛页面现在只负责浏览。发帖、点赞和回复都应该由已认领 Agent 按 Prompt 或 API 触发。/
  );
  assert.match(
    html,
    /class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"/
  );
  assert.doesNotMatch(html, /Execution Plane/);
  assert.doesNotMatch(html, /管理我的 Agents/);
  assert.doesNotMatch(html, /查看 Prompt Wiki/);
});

test("tasks list page keeps only the read-only hint in the shell", () => {
  const html = renderPage(<TasksPage />);

  assert.match(html, /任务板/);
  assert.match(
    html,
    /任务板页面现在只负责查看公开任务。发布、认领、完成和验收都应由已认领 Agent 自行调用官方接口。/
  );
  assert.doesNotMatch(html, /Execution Plane/);
  assert.doesNotMatch(html, /管理我的 Agents/);
  assert.doesNotMatch(html, /查看 Prompt Wiki/);
});

test("shop list page keeps only the read-only hint in the shell", () => {
  const html = renderPage(<ShopPage />);

  assert.match(html, /商店/);
  assert.match(
    html,
    /用积分购买装饰，并立即装备到你的龙虾形象上。/
  );
  assert.doesNotMatch(html, /Execution Plane/);
  assert.doesNotMatch(html, /管理我的 Agents/);
  assert.doesNotMatch(html, /查看 Prompt Wiki/);
});

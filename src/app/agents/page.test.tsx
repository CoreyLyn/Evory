import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import AgentsPage from "./page";
import { LocaleProvider } from "@/i18n";

test("agents page renders the shared header copy", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <AgentsPage />
    </LocaleProvider>
  );

  assert.match(html, /Agent 目录/);
  assert.match(
    html,
    /这里展示公开 Agent 档案、状态与积分概览，方便快速浏览整个目录。/
  );
  assert.match(html, /按积分排序/);
});

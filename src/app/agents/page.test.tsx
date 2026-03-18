import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import AgentsPage, { AgentDirectoryCard } from "./page";
import { LocaleProvider } from "@/i18n";

const translations = {
  "agents.owner": "主人",
  "agents.viewProfile": "查看资料",
  "common.pts": "分",
} as const;

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

test("agent directory card renders the public owner when present", () => {
  const html = renderToStaticMarkup(
    <AgentDirectoryCard
      agent={{
        id: "agent-1",
        name: "Alpha",
        type: "OPENCLAW",
        status: "WORKING",
        points: 12,
        bio: "",
        createdAt: "2026-03-01T00:00:00.000Z",
        owner: { id: "user-1", displayName: "Corey" },
      }}
      t={(key) => translations[key as keyof typeof translations]}
      formatTimeAgo={(value) => value}
    />
  );

  assert.match(html, /lucide-user/);
  assert.match(html, /Corey/);
});

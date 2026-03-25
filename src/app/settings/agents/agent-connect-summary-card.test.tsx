import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AgentConnectSummaryCard } from "./agent-connect-summary-card";

test("AgentConnectSummaryCard renders counts and reply previews", () => {
  const html = renderToStaticMarkup(
    <AgentConnectSummaryCard
      summary={{
        deliveredAt: "2026-03-25T10:00:00.000Z",
        forumLikeCount: 3,
        forumReplyCount: 2,
        taskClaimCount: 1,
        taskCompleteCount: 4,
        items: [
          {
            id: "eng-1",
            domain: "FORUM",
            type: "REPLY",
            createdAt: "2026-03-25T09:58:00.000Z",
            post: { id: "post-1", title: "Post title" },
            actorAgent: { id: "agent-2", name: "Reviewer", type: "CUSTOM" },
            reply: { id: "reply-1", content: "Useful reply" },
          },
          {
            id: "task-1",
            domain: "TASK",
            type: "CLAIMED",
            createdAt: "2026-03-25T09:57:00.000Z",
            task: { id: "task-9", title: "Fix the agent connect flow" },
            actorAgent: { id: "agent-3", name: "Builder", type: "CODEX" },
          },
        ],
      }}
    />
  );

  assert.match(html, /2 条新回复/);
  assert.match(html, /3 个新点赞/);
  assert.match(html, /1 个新认领/);
  assert.match(html, /4 个新完成/);
  assert.match(html, /Reviewer/);
  assert.match(html, /Useful reply/);
  assert.match(html, /href="\/forum\/post-1"/);
  assert.match(html, /Builder/);
  assert.match(html, /href="\/tasks\/task-9"/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AgentConnectSummaryCard } from "./agent-connect-summary-card";

test("AgentConnectSummaryCard renders counts and reply previews", () => {
  const html = renderToStaticMarkup(
    <AgentConnectSummaryCard
      summary={{
        deliveredAt: "2026-03-25T10:00:00.000Z",
        likeCount: 3,
        replyCount: 2,
        items: [
          {
            id: "eng-1",
            type: "REPLY",
            createdAt: "2026-03-25T09:58:00.000Z",
            post: { id: "post-1", title: "Post title" },
            actorAgent: { id: "agent-2", name: "Reviewer", type: "CUSTOM" },
            reply: { id: "reply-1", content: "Useful reply" },
          },
        ],
      }}
    />
  );

  assert.match(html, /2 条新回复/);
  assert.match(html, /3 个新点赞/);
  assert.match(html, /Reviewer/);
  assert.match(html, /Useful reply/);
  assert.match(html, /href="\/forum\/post-1"/);
});

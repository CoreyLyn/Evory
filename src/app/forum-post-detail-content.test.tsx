import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ForumPostDetailContent } from "./forum/[id]/page";
import { LocaleProvider, useT } from "@/i18n";

function ForumPostDetailContentHarness() {
  const t = useT();

  return (
    <ForumPostDetailContent
      t={t}
      formatTimeAgo={() => "1天前"}
      post={{
        id: "post-1",
        title: "Weekly agent meetup notes",
        content: [
          "# Weekly agent meetup notes",
          "",
          "> Capture what changed",
          "",
          "- [x] API review",
          "- [ ] publish recap",
        ].join("\n"),
        category: "general",
        viewCount: 1,
        likeCount: 0,
        createdAt: "2026-03-10T00:00:00.000Z",
        agent: {
          id: "agent-1",
          name: "KnowledgeSeeker",
          type: "premium",
        },
        tags: [
          { slug: "api", label: "API", kind: "core", source: "auto" },
          {
            slug: "deployment",
            label: "Deployment",
            kind: "core",
            source: "manual",
          },
        ],
        replies: [
          {
            id: "reply-1",
            content: [
              "Reply with `details`.",
              "",
              "```md",
              "follow-up",
              "```",
            ].join("\n"),
            createdAt: "2026-03-10T00:00:00.000Z",
            agent: {
              id: "agent-2",
              name: "BugHunter",
              type: "custom",
            },
          },
        ],
      }}
    />
  );
}

test("forum post detail content omits the execution plane controls", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ForumPostDetailContentHarness />
    </LocaleProvider>
  );

  assert.match(html, /Weekly agent meetup notes/);
  assert.match(html, /回复 \(1\)/);
  assert.match(html, /API/);
  assert.match(html, /Deployment/);
  assert.match(html, /<blockquote/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /<pre/);
  assert.match(html, /data-markdown-content="default"/);
  assert.match(html, /data-markdown-content="compact"/);
  assert.doesNotMatch(html, /Execution Plane/);
  assert.doesNotMatch(html, /管理我的 Agents/);
  assert.doesNotMatch(html, /查看 Prompt Wiki/);
});

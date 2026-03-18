import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ForumPostListContent } from "./forum/page";
import { LocaleProvider, useT } from "@/i18n";

function ForumPostListContentHarness() {
  const t = useT();

  return (
    <ForumPostListContent
      t={t}
      formatTimeAgo={() => "1天前"}
      posts={[
        {
          id: "post-1",
          title: "API deployment bugfix",
          content: "# Heading\n\nNeed to deploy a fix.",
          category: "technical",
          viewCount: 5,
          likeCount: 1,
          createdAt: "2026-03-18T00:00:00.000Z",
          replyCount: 2,
          agent: { id: "agent-1", name: "Author", type: "CUSTOM" },
          tags: [
            { slug: "api", label: "API", kind: "core", source: "auto" },
            {
              slug: "deployment",
              label: "Deployment",
              kind: "core",
              source: "auto",
            },
          ],
        },
      ]}
      searchQuery="timeout"
      selectedTagSlugs={["api"]}
      availableTags={[
        { slug: "api", label: "API", kind: "core", postCount: 3 },
      ]}
      onSearchChange={() => {}}
      onTagToggle={() => {}}
    />
  );
}

test("forum post list content renders tags and active tag filters", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ForumPostListContentHarness />
    </LocaleProvider>
  );

  assert.match(html, /API/);
  assert.match(html, /Deployment/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /type="search"/);
  assert.match(html, /placeholder="/);
  assert.match(html, /\(3\)/);
  assert.doesNotMatch(html, /<h1[^>]*>Heading<\/h1>/);
  assert.match(html, />Heading Need to deploy a fix\.<\/p>/);
  assert.doesNotMatch(html, /# Heading/);
});

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
          featured: true,
          viewCount: 5,
          likeCount: 1,
          createdAt: "2026-03-18T00:00:00.000Z",
          updatedAt: "2026-03-18T06:00:00.000Z",
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
            { slug: "infra", label: "Infra", kind: "freeform", source: "manual" },
          ],
        },
      ]}
      resultCount={12}
      hasActiveFilters
      selectedTagSlugs={["api"]}
      availableTags={[
        { slug: "api", label: "API", kind: "core", postCount: 3 },
      ]}
      onTagToggle={() => {}}
      onClearFilters={() => {}}
    />
  );
}

test("forum post list content renders the editorial list hierarchy", () => {
  const html = renderToStaticMarkup(
    <LocaleProvider>
      <ForumPostListContentHarness />
    </LocaleProvider>
  );

  assert.match(html, /(Editors&#x27; pick|编辑精选)/);
  assert.match(html, /(12 results|共 12 条结果)/);
  assert.match(html, /(Clear filters|清除筛选)/);
  assert.match(html, /API/);
  assert.match(html, /Deployment/);
  assert.match(html, />\+1</);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /\(3\)/);
  assert.doesNotMatch(html, /<h1[^>]*>Heading<\/h1>/);
  assert.match(html, />Heading Need to deploy a fix\.<\/p>/);
  assert.doesNotMatch(html, /# Heading/);
});

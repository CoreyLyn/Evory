import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { MarkdownContent } from "./markdown-content";

test("MarkdownContent renders headings, lists, blockquotes, and code", () => {
  const html = renderToStaticMarkup(
    <MarkdownContent
      content={[
        "# Title",
        "",
        "- item one",
        "- item two",
        "",
        "> quoted",
        "",
        "Inline `code` sample.",
        "",
        "```ts",
        "console.log('hello');",
        "```",
      ].join("\n")}
    />
  );

  assert.match(html, /<h1[^>]*id="title"[^>]*>/);
  assert.match(html, /data-markdown-heading-link="title"/);
  assert.match(html, /<span>Title<\/span>/);
  assert.match(html, /<ul>/);
  assert.match(html, /<blockquote/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<pre/);
  assert.match(html, /console\.log/);
});

test("MarkdownContent adds heading anchors and code block controls", () => {
  const html = renderToStaticMarkup(
    <MarkdownContent
      content={[
        "## Deploy Plan",
        "",
        "```ts",
        "const ship = 'ship';",
        "```",
      ].join("\n")}
    />
  );

  assert.match(html, /id="deploy-plan"/);
  assert.match(html, /href="#deploy-plan"/);
  assert.match(html, /data-markdown-code-language="ts"/);
  assert.match(html, /data-markdown-copy="code-block"/);
  assert.match(html, /data-token="keyword"/);
  assert.match(html, /data-token="string"/);
});

test("MarkdownContent renders tables and read-only task lists", () => {
  const html = renderToStaticMarkup(
    <MarkdownContent
      content={[
        "| Name | Value |",
        "| --- | --- |",
        "| API | Stable |",
        "",
        "- [x] shipped",
        "- [ ] pending",
      ].join("\n")}
    />
  );

  assert.match(
    html,
    /data-markdown-table="true"[^>]*class="[^"]*overflow-x-auto[^"]*rounded-2xl[^"]*border[^"]*bg-card\/40[^"]*"/
  );
  assert.match(
    html,
    /<table[^>]*class="[^"]*min-w-full[^"]*border-collapse[^"]*text-left[^"]*text-sm[^"]*"/
  );
  assert.match(
    html,
    /<thead[^>]*class="[^"]*border-b[^"]*border-card-border\/70[^"]*bg-background\/40[^"]*"/
  );
  assert.match(
    html,
    /<tr[^>]*class="[^"]*border-b[^"]*border-card-border\/40[^"]*last:border-b-0[^"]*"/
  );
  assert.match(
    html,
    /<th[^>]*class="[^"]*px-4[^"]*py-3[^"]*font-semibold[^"]*tracking-\[0\.02em\][^"]*"/
  );
  assert.match(
    html,
    /<td[^>]*class="[^"]*px-4[^"]*py-3[^"]*align-top[^"]*text-foreground\/90[^"]*"/
  );
  assert.match(html, /<table/);
  assert.match(html, /<td[^>]*>API<\/td>/);
  assert.match(html, /type="checkbox"/);
});

test("MarkdownContent keeps raw HTML inert and external links safe", () => {
  const html = renderToStaticMarkup(
    <MarkdownContent
      content={[
        "<script>alert('xss')</script>",
        "",
        "[Docs](https://example.com)",
      ].join("\n")}
    />
  );

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert/);
  assert.match(html, /href="https:\/\/example\.com"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noreferrer noopener"/);
});

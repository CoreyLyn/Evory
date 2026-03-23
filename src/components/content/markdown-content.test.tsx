import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { MarkdownContent, removeEmptyMarkdownTextNodes } from "./markdown-content";

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

test("MarkdownContent applies distinct heading tiers", () => {
  const html = renderToStaticMarkup(
    <MarkdownContent
      content={[
        "# Document Title",
        "",
        "## Section Title",
        "",
        "### Subsection Title",
        "",
        "#### Eyebrow Title",
      ].join("\n")}
    />
  );

  assert.match(
    html,
    /<h1[^>]*class="[^"]*group[^"]*first:mt-0[^"]*mt-8[^"]*text-3xl[^"]*font-semibold[^"]*tracking-tight[^"]*sm:text-4xl[^"]*"/
  );
  assert.match(
    html,
    /<h2[^>]*class="[^"]*mt-10[^"]*text-2xl[^"]*font-semibold[^"]*tracking-tight[^"]*sm:text-\[1\.75rem\][^"]*"/
  );
  assert.match(
    html,
    /<h3[^>]*class="[^"]*mt-8[^"]*text-lg[^"]*font-semibold[^"]*tracking-tight[^"]*sm:text-xl[^"]*"/
  );
  assert.match(
    html,
    /<h4[^>]*class="[^"]*mt-6[^"]*text-base[^"]*uppercase[^"]*tracking-\[0\.14em\][^"]*text-muted[^"]*"/
  );
});

test("MarkdownContent adds comfortable body insets by variant", () => {
  const defaultHtml = renderToStaticMarkup(
    <MarkdownContent content={"Paragraph"} />
  );
  const compactHtml = renderToStaticMarkup(
    <MarkdownContent content={"Paragraph"} variant="compact" />
  );

  assert.match(
    defaultHtml,
    /data-markdown-content="default"[^>]*class="[^"]*px-1[^"]*sm:px-2[^"]*"/
  );
  assert.match(
    compactHtml,
    /data-markdown-content="compact"[^>]*class="[^"]*px-0\.5[^"]*sm:px-1[^"]*"/
  );
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

test("MarkdownContent repairs quoted strong markers embedded in prose", () => {
  const html = renderToStaticMarkup(
    <MarkdownContent
      content={[
        'OpenAI 正在从研究实验室向**"AI 超级应用公司"**全面转型。',
        "",
        'OpenAI 也在向**“AI 原生产品公司”**持续演进。',
        "",
        '行内代码 `**"保持原样"**` 不应该被修复。',
      ].join("\n")}
    />
  );

  assert.match(
    html,
    /OpenAI 正在从研究实验室向<strong>&quot;AI 超级应用公司&quot;<\/strong>全面转型。/
  );
  assert.match(
    html,
    /OpenAI 也在向<strong>“AI 原生产品公司”<\/strong>持续演进。/
  );
  assert.match(html, /<code>\*\*&quot;保持原样&quot;\*\*<\/code>/);
});

test("removeEmptyMarkdownTextNodes drops only empty text nodes", () => {
  const result = removeEmptyMarkdownTextNodes([
    { type: "text", value: "" },
    {
      type: "strong",
      children: [{ type: "text", value: '"AI 超级应用公司"' }],
    },
    { type: "text", value: " trailing" },
  ]);

  assert.deepEqual(result, [
    {
      type: "strong",
      children: [{ type: "text", value: '"AI 超级应用公司"' }],
    },
    { type: "text", value: " trailing" },
  ]);
});

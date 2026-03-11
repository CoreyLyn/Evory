import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import PromptsWikiPage from "./page";

test("prompt wiki page renders the core prompt sections", async () => {
  const html = renderToStaticMarkup(await PromptsWikiPage());

  assert.match(html, /Prompt Wiki/);
  assert.match(html, /首次接入/);
  assert.match(html, /读取平台上下文/);
  assert.match(html, /任务执行/);
  assert.match(html, /论坛参与/);
  assert.match(html, /知识沉淀/);
});

test("prompt wiki page uses softened light-mode surfaces for prompt cards", async () => {
  const html = renderToStaticMarkup(await PromptsWikiPage());

  assert.match(html, /var\(--prompt-step-card-surface\)/);
  assert.match(html, /var\(--prompt-step-card-shadow\)/);
  assert.match(html, /var\(--prompt-step-topline\)/);
  assert.match(html, /var\(--prompt-step-badge-surface\)/);
  assert.match(html, /var\(--prompt-code-surface\)/);
  assert.match(html, /var\(--prompt-code-foreground\)/);
});

test("prompt wiki page restores dark-mode surfaces for prompt cards", async () => {
  const html = renderToStaticMarkup(await PromptsWikiPage());

  assert.doesNotMatch(html, /dark:hidden/);
  assert.doesNotMatch(html, /dark:block/);
  assert.doesNotMatch(html, /dark:bg-black\/20/);
  assert.doesNotMatch(html, /dark:text-foreground/);
});

test("prompt wiki page keeps code panel light and dark surfaces on separate layers", async () => {
  const html = renderToStaticMarkup(await PromptsWikiPage());

  assert.match(html, /var\(--prompt-code-border\)/);
  assert.match(html, /var\(--prompt-code-shadow\)/);
  assert.match(html, /whitespace-pre-wrap/);
});

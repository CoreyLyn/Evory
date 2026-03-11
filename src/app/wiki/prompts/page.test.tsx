import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import PromptsWikiPage from "./page";
import { skillDocument } from "@/lib/agent-public-documents";

test("prompt wiki page renders the core prompt sections", async () => {
  const html = renderToStaticMarkup(await PromptsWikiPage());

  assert.match(html, /Prompt Wiki/);
  assert.match(html, /推荐入口/);
  assert.match(html, /读取 Evory 的技能文档：curl -s https:\/\/evory\.aicorey\.de\/SKILL\.md/);
  assert.match(html, /给 Agent 直接读取/);
  assert.match(html, /给人理解和复制备用模板/);
  assert.match(html, /https:\/\/evory\.aicorey\.de\/SKILL\.md/);
  assert.match(html, /先检查是否已有可复用的 Evory key/);
  assert.match(html, /只有在用户明确同意接入后，才调用 POST \/api\/agents\/register/);
  assert.match(html, /首次接入/);
  assert.match(html, /读取平台上下文/);
  assert.match(html, /任务执行/);
  assert.match(html, /论坛参与/);
  assert.match(html, /知识沉淀/);
});

test("prompt wiki onboarding stays aligned with the published SKILL contract", async () => {
  const html = renderToStaticMarkup(await PromptsWikiPage());

  assert.match(skillDocument, /Reuse an existing local Evory key/);
  assert.match(skillDocument, /explicit user approval/);
  assert.match(skillDocument, /EVORY_AGENT_API_KEY/);
  assert.match(skillDocument, /Check for a stored Evory credential in this order:[\s\S]*1\.\s*EVORY_AGENT_API_KEY[\s\S]*2\.\s*user-level config/);
  assert.match(skillDocument, /~\/\.config\/evory\/agents\/default\.json/);
  assert.doesNotMatch(skillDocument, /\.env\.local/);
  assert.doesNotMatch(skillDocument, /\.evory\/agent\.json/);
  assert.match(skillDocument, /npm run agent:credential:replace/);
  assert.match(html, /先检查是否已有可复用的 Evory key/);
  assert.match(html, /只有在用户明确同意接入后，才调用 POST \/api\/agents\/register/);
  assert.match(html, /EVORY_AGENT_API_KEY/);
  assert.match(html, /EVORY_AGENT_API_KEY[\s\S]*显式覆盖所有其他来源[\s\S]*~\/\.config\/evory\/agents\/default\.json/);
  assert.match(html, /~\/\.config\/evory\/agents\/default\.json/);
  assert.doesNotMatch(html, /\.env\.local/);
  assert.doesNotMatch(html, /\.evory\/agent\.json/);
  assert.match(html, /npm run agent:credential:replace/);
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

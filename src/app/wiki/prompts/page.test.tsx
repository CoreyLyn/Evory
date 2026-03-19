import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import PromptsWikiPage from "./page";
import { skillDocument } from "@/lib/agent-public-documents";

function extractText(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

test("prompt wiki page renders the core prompt sections", async () => {
  const html = renderToStaticMarkup(await PromptsWikiPage());
  const text = extractText(html);

  assert.match(html, /Prompt 指南/);
  assert.match(html, /推荐入口/);
  assert.match(html, /读取 Evory 的技能文档：curl -s https:\/\/evory\.aicorey\.de\/skill\.md/);
  assert.match(text, /给 Agent 直接读取/);
  assert.match(text, /给人理解流程和复制备用模板/);
  assert.match(html, /https:\/\/evory\.aicorey\.de\/skill\.md/);
  assert.match(text, /Windows bash/);
  assert.match(text, /Unicode 转义/);
  assert.match(text, /\\u4e2d\\u6587/);
  assert.match(text, /先检查是否已有可复用的 Evory key/);
  assert.match(text, /只有在用户明确同意接入后，才调用 POST \/api\/agents\/register/);
  assert.match(text, /pending_binding/);
  assert.match(text, /data\.id/);
  assert.match(text, /credentialScopes/);
  assert.match(text, /credentialExpiresAt/);
  assert.match(text, /首次接入/);
  assert.match(text, /读取平台上下文/);
  assert.match(text, /任务执行/);
  assert.match(text, /发布任务/);
  assert.match(text, /先询问用户是否需要悬赏积分/);
  assert.match(text, /明确的积分数值/);
  assert.match(text, /论坛参与/);
  assert.match(text, /商店与积分/);
  assert.match(text, /知识沉淀/);
  assert.match(text, /安全提示/);
  assert.doesNotMatch(text, /首次接人时/);
  assert.doesNotMatch(text, /Security Notes/);
});

test("prompt wiki onboarding stays aligned with the published SKILL contract", async () => {
  const html = renderToStaticMarkup(await PromptsWikiPage());
  const text = extractText(html);

  assert.match(skillDocument, /Reuse an existing local Evory key/);
  assert.match(skillDocument, /explicit user approval/);
  assert.match(skillDocument, /ask the user whether the task should include bounty points/i);
  assert.match(skillDocument, /explicit bounty amount/i);
  assert.match(skillDocument, /EVORY_AGENT_API_KEY/);
  assert.match(skillDocument, /Check for a stored Evory credential in this order:[\s\S]*1\.\s*EVORY_AGENT_API_KEY[\s\S]*2\.\s*user-level config/);
  assert.match(skillDocument, /~\/\.config\/evory\/agents\/default\.json/);
  assert.doesNotMatch(skillDocument, /\.env\.local/);
  assert.doesNotMatch(skillDocument, /\.evory\/agent\.json/);
  assert.match(skillDocument, /npm run agent:credential:replace/);
  assert.match(skillDocument, /pbpaste/);
  assert.match(skillDocument, /Windows bash/i);
  assert.match(skillDocument, /Unicode escapes/i);
  assert.doesNotMatch(skillDocument, /--api-key/);
  assert.match(text, /先检查是否已有可复用的 Evory key/);
  assert.match(text, /只有在用户明确同意接入后，才调用 POST \/api\/agents\/register/);
  assert.match(text, /EVORY_AGENT_API_KEY/);
  assert.match(text, /EVORY_AGENT_API_KEY[\s\S]*显式覆盖所有其他来源[\s\S]*~\/\.config\/evory\/agents\/default\.json/);
  assert.match(text, /~\/\.config\/evory\/agents\/default\.json/);
  assert.match(text, /pending_binding/);
  assert.match(text, /GET \/api\/agent\/tasks[\s\S]*成功/);
  assert.match(text, /data\.id/);
  assert.match(text, /credentialScopes/);
  assert.match(text, /credentialExpiresAt/);
  assert.match(text, /POST \/api\/agent\/tasks/);
  assert.match(text, /先询问用户是否需要悬赏积分/);
  assert.match(text, /明确的积分数值/);
  assert.match(text, /POST \/api\/agent\/shop\/purchase/);
  assert.match(text, /PUT \/api\/agent\/equipment/);
  assert.match(text, /Windows bash/);
  assert.match(text, /UTF-8/);
  assert.match(text, /\\u4e2d\\u6587/);
  assert.doesNotMatch(text, /\.env\.local/);
  assert.doesNotMatch(text, /\.evory\/agent\.json/);
  assert.match(text, /npm run agent:credential:replace/);
  assert.match(text, /pbpaste/);
  assert.doesNotMatch(text, /--api-key/);
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

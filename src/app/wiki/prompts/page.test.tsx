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

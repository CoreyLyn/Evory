import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleProvider } from "@/i18n";
import KnowledgePathPage from "./page";
import {
  createKnowledgeApiSandbox,
  useKnowledgeBaseRoot,
  writeKnowledgeMarkdown,
} from "../../api/knowledge/test-helpers";

function renderPage(page: React.ReactElement) {
  return renderToStaticMarkup(<LocaleProvider>{page}</LocaleProvider>);
}

test("knowledge path page renders directory landing markdown plus child listings", async (t) => {
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.knowledgeRoot);
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "guides/install/README.md",
    "# Install\n\nDirectory landing.\n"
  );
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "guides/install/nginx.md",
    "# Nginx Install\n\nInstall nginx.\n"
  );

  const page = await KnowledgePathPage({
    params: Promise.resolve({ slug: ["guides", "install"] }),
  });
  const html = renderPage(page);

  assert.match(html, /data-knowledge-kind="directory"/);
  assert.equal(
    [...html.matchAll(/<h1[^>]*>Install<\/h1>/g)].length,
    1
  );
  assert.match(html, /Directory landing\./);
  assert.match(html, /data-knowledge-section="documents"/);
  assert.match(html, /Nginx Install/);
});

test("knowledge path page renders markdown content for a regular document", async (t) => {
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.knowledgeRoot);
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "guides/install/nginx.md",
    [
      "# Nginx Install",
      "",
      "> Provision before deploy",
      "",
      "- [x] package",
      "- [ ] verify config",
      "",
      "[Runbook](https://example.com/runbook)",
      "",
      "| Port | Purpose |",
      "| --- | --- |",
      "| 443 | HTTPS |",
      "",
    ].join("\n")
  );

  const page = await KnowledgePathPage({
    params: Promise.resolve({ slug: ["guides", "install", "nginx"] }),
  });
  const html = renderPage(page);

  assert.match(html, /data-knowledge-kind="document"/);
  assert.equal(
    [...html.matchAll(/<h1[^>]*>Nginx Install<\/h1>/g)].length,
    1
  );
  assert.match(html, /<blockquote/);
  assert.match(html, /type="checkbox"/);
  assert.match(html, /<table/);
  assert.match(html, /data-markdown-content="default"/);
  assert.match(
    html,
    /<a href="https:\/\/example\.com\/runbook" target="_blank" rel="noreferrer noopener">Runbook<\/a>/
  );
});

test("knowledge path page renders a back-navigation affordance for missing documents", async (t) => {
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.knowledgeRoot);

  const page = await KnowledgePathPage({
    params: Promise.resolve({ slug: ["missing", "path"] }),
  });
  const html = renderPage(page);

  assert.match(html, /data-knowledge-state="not-found"/);
  assert.match(html, /返回知识库/);
});

test("knowledge path page decodes encoded document paths", async (t) => {
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.knowledgeRoot);
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "release notes/100% rollout.md",
    "# Rollout\n\nEncoded path.\n"
  );

  const page = await KnowledgePathPage({
    params: Promise.resolve({ slug: ["release%20notes", "100%25%20rollout"] }),
  });
  const html = renderPage(page);

  assert.match(html, /data-knowledge-kind="document"/);
  assert.match(html, /Rollout/);
  assert.match(html, /Encoded path\./);
});

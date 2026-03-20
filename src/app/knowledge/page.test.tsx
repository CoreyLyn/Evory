import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import prisma from "@/lib/prisma";
import KnowledgePage from "./page";
import { LocaleProvider } from "@/i18n";
import {
  createKnowledgeApiSandbox,
  useKnowledgeBaseRoot,
  writeKnowledgeMarkdown,
} from "../api/knowledge/test-helpers";

function renderPage(page: React.ReactElement) {
  return renderToStaticMarkup(<LocaleProvider>{page}</LocaleProvider>);
}

const prismaClient = prisma as Record<string, unknown>;
const originalSiteConfig = prismaClient.siteConfig;

afterEach(() => {
  prismaClient.siteConfig = originalSiteConfig;
});

test("knowledge root page keeps the search shell compact across breakpoints", async (t) => {
  prismaClient.siteConfig = {
    findFirst: async () => null,
  };
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.knowledgeRoot);
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "README.md",
    "# Knowledge Home\n\nRead the docs.\n"
  );
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "guides/README.md",
    "# Guides\n\nDirectory landing.\n"
  );
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "guides/install.md",
    "# Install\n\nInstall guide.\n"
  );

  const page = await KnowledgePage({
    searchParams: Promise.resolve({}),
  });
  const html = renderPage(page);

  assert.match(
    html,
    /<form[^>]*class="[^"]*\bw-full\b[^"]*\bmax-w-\[18rem\][^"]*\bsm:w-auto\b[^"]*\bsm:max-w-\[20rem\][^"]*"/
  );
  assert.match(
    html,
    /type="search"[^>]*class="[^"]*\bmin-w-0\b[^"]*\bflex-1\b[^"]*"/
  );
  assert.match(html, /data-knowledge-breadcrumbs="root"/);
  assert.match(html, /data-knowledge-section="directories"/);
  assert.match(html, /data-knowledge-section="documents"/);
  assert.doesNotMatch(html, /data-legacy-article-card/);
});

test("knowledge root page shows an explicit unconfigured state", async (t) => {
  prismaClient.siteConfig = {
    findFirst: async () => null,
  };
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.missingKnowledgeRoot);

  const page = await KnowledgePage({
    searchParams: Promise.resolve({}),
  });
  const html = renderPage(page);

  assert.match(html, /data-knowledge-state="not-configured"/);
  assert.match(html, /知识库/);
  assert.match(html, /知识库尚未配置/);
  assert.match(html, /挂载知识库目录/);
});

test("knowledge root page URL-encodes document links", async (t) => {
  prismaClient.siteConfig = {
    findFirst: async () => null,
  };
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.knowledgeRoot);
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "100% rollout.md",
    "# Rollout\n\nEncoded path.\n"
  );

  const page = await KnowledgePage({
    searchParams: Promise.resolve({}),
  });
  const html = renderPage(page);

  assert.match(html, /href="\/knowledge\/100%25%20rollout"/);
});

test("knowledge root page still renders for admins when public content is disabled", async (t) => {
  prismaClient.siteConfig = {
    findFirst: async () => ({
      id: "site-config-singleton",
      registrationEnabled: true,
      publicContentEnabled: false,
    }),
  };
  const sandbox = await createKnowledgeApiSandbox(t);
  useKnowledgeBaseRoot(t, sandbox.knowledgeRoot);
  await writeKnowledgeMarkdown(
    sandbox.knowledgeRoot,
    "README.md",
    "# Knowledge Home\n\nRead the docs.\n"
  );

  const page = await KnowledgePage({
    searchParams: Promise.resolve({}),
    viewerRole: "ADMIN",
  });
  const html = renderPage(page);

  assert.match(html, /知识库/);
  assert.doesNotMatch(html, /公开内容暂不可用/);
});

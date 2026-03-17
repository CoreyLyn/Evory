import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  getKnowledgeBase,
  invalidateKnowledgeBaseCache,
  refreshKnowledgeBase,
  resetKnowledgeBaseCacheForTests,
  setKnowledgeBaseBuildObserverForTests,
  warmKnowledgeBase,
} from "./service";

async function createSandbox() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evory-knowledge-base-service-"));
  const cwd = path.join(root, "workspace");
  const defaultKnowledgeRoot = path.join(cwd, "knowledge");
  const customKnowledgeRoot = path.join(root, "mounted-knowledge");

  await mkdir(cwd, { recursive: true });
  await mkdir(defaultKnowledgeRoot, { recursive: true });
  await mkdir(customKnowledgeRoot, { recursive: true });

  return {
    cwd,
    defaultKnowledgeRoot,
    customKnowledgeRoot,
    missingKnowledgeRoot: path.join(root, "missing-knowledge"),
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
}

async function writeMarkdown(
  root: string,
  relativePath: string,
  content: string
) {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

test("getKnowledgeBase prefers KNOWLEDGE_BASE_DIR over the project-local fallback", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => {
    resetKnowledgeBaseCacheForTests();
    await sandbox.cleanup();
  });

  await writeMarkdown(
    sandbox.defaultKnowledgeRoot,
    "README.md",
    "# Default\n\nThis should be ignored when env override is present.\n"
  );
  await writeMarkdown(
    sandbox.customKnowledgeRoot,
    "README.md",
    "# Mounted Knowledge\n\nUse the mounted content instead.\n"
  );

  const knowledgeBase = await getKnowledgeBase({
    cwd: sandbox.cwd,
    env: {
      KNOWLEDGE_BASE_DIR: sandbox.customKnowledgeRoot,
    },
  });

  assert.equal(knowledgeBase.status, "ready");
  assert.equal(knowledgeBase.rootDir, sandbox.customKnowledgeRoot);
  assert.equal(knowledgeBase.index.root.document?.title, "Mounted Knowledge");
});

test("getKnowledgeBase resolves relative KNOWLEDGE_BASE_DIR values against cwd", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => {
    resetKnowledgeBaseCacheForTests();
    await sandbox.cleanup();
  });

  const relativeRoot = "docs-kb";
  const resolvedRoot = path.join(sandbox.cwd, relativeRoot);
  await mkdir(resolvedRoot, { recursive: true });
  await writeMarkdown(
    resolvedRoot,
    "README.md",
    "# Relative Knowledge\n\nResolved from cwd.\n"
  );

  const knowledgeBase = await getKnowledgeBase({
    cwd: sandbox.cwd,
    env: {
      KNOWLEDGE_BASE_DIR: relativeRoot,
    },
  });

  assert.equal(knowledgeBase.status, "ready");
  assert.equal(knowledgeBase.rootDir, resolvedRoot);
  assert.equal(knowledgeBase.index.root.document?.title, "Relative Knowledge");
});

test("getKnowledgeBase reports a structured not-configured state when the knowledge root is missing", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => {
    resetKnowledgeBaseCacheForTests();
    await sandbox.cleanup();
  });

  const knowledgeBase = await getKnowledgeBase({
    cwd: sandbox.cwd,
    env: {
      KNOWLEDGE_BASE_DIR: sandbox.missingKnowledgeRoot,
    },
  });

  assert.equal(knowledgeBase.status, "not_configured");
  assert.equal(knowledgeBase.rootDir, sandbox.missingKnowledgeRoot);
  assert.equal(knowledgeBase.index, null);
});

test("getKnowledgeBase reports not_configured when the configured root is not a directory", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => {
    resetKnowledgeBaseCacheForTests();
    await sandbox.cleanup();
  });

  const fileRoot = path.join(sandbox.cwd, "knowledge-file.md");
  await writeFile(fileRoot, "# Not A Directory\n");

  const knowledgeBase = await getKnowledgeBase({
    cwd: sandbox.cwd,
    env: {
      KNOWLEDGE_BASE_DIR: fileRoot,
    },
  });

  assert.equal(knowledgeBase.status, "not_configured");
  assert.equal(knowledgeBase.rootDir, fileRoot);
  assert.equal(knowledgeBase.index, null);
});

test("getKnowledgeBase caches the current index until refreshKnowledgeBase is called", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => {
    resetKnowledgeBaseCacheForTests();
    await sandbox.cleanup();
  });

  await writeMarkdown(
    sandbox.defaultKnowledgeRoot,
    "README.md",
    "# First Snapshot\n\nThis is the first rendered body.\n"
  );

  const first = await getKnowledgeBase({
    cwd: sandbox.cwd,
    env: {},
  });

  assert.equal(first.status, "ready");
  assert.equal(first.index.root.document?.title, "First Snapshot");

  await new Promise((resolve) => setTimeout(resolve, 10));
  await writeMarkdown(
    sandbox.defaultKnowledgeRoot,
    "README.md",
    "# Second Snapshot\n\nThis content only appears after refresh.\n"
  );

  const cached = await getKnowledgeBase({
    cwd: sandbox.cwd,
    env: {},
  });

  assert.equal(cached.index.root.document?.title, "First Snapshot");

  const refreshed = await refreshKnowledgeBase({
    cwd: sandbox.cwd,
    env: {},
  });

  assert.equal(refreshed.status, "ready");
  assert.equal(refreshed.index.root.document?.title, "Second Snapshot");
});

test("invalidateKnowledgeBaseCache clears the cached snapshot so the next read rebuilds once", async (t) => {
  const sandbox = await createSandbox();
  t.after(async () => {
    resetKnowledgeBaseCacheForTests();
    await sandbox.cleanup();
  });

  await writeMarkdown(
    sandbox.defaultKnowledgeRoot,
    "README.md",
    "# First Snapshot\n\nOriginal content.\n"
  );

  const first = await getKnowledgeBase({
    cwd: sandbox.cwd,
    env: {},
  });

  assert.equal(first.status, "ready");
  assert.equal(first.index.root.document?.title, "First Snapshot");

  await writeMarkdown(
    sandbox.defaultKnowledgeRoot,
    "README.md",
    "# Second Snapshot\n\nUpdated content.\n"
  );
  const updatedReadmePath = path.join(sandbox.defaultKnowledgeRoot, "README.md");
  const bumpedMtime = new Date(Date.now() + 2_000);
  await utimes(updatedReadmePath, bumpedMtime, bumpedMtime);

  invalidateKnowledgeBaseCache();

  const rebuilt = await getKnowledgeBase({
    cwd: sandbox.cwd,
    env: {},
  });
  const cachedAgain = await getKnowledgeBase({
    cwd: sandbox.cwd,
    env: {},
  });

  assert.equal(rebuilt.status, "ready");
  assert.equal(rebuilt.index.root.document?.title, "Second Snapshot");
  assert.equal(cachedAgain.index.root.document?.title, "Second Snapshot");
  assert.equal(rebuilt.index.root.document?.title, cachedAgain.index.root.document?.title);
});

test("warmKnowledgeBase deduplicates concurrent background rebuilds", async (t) => {
  const sandbox = await createSandbox();
  const buildStarts: string[] = [];
  const releaseBuild = Promise.withResolvers<void>();

  t.after(async () => {
    setKnowledgeBaseBuildObserverForTests(null);
    resetKnowledgeBaseCacheForTests();
    await sandbox.cleanup();
  });

  await writeMarkdown(
    sandbox.defaultKnowledgeRoot,
    "README.md",
    "# First Snapshot\n\nOriginal content.\n"
  );

  await getKnowledgeBase({
    cwd: sandbox.cwd,
    env: {},
  });

  setKnowledgeBaseBuildObserverForTests(async ({ phase }) => {
    if (phase === "start") {
      buildStarts.push("start");
      await releaseBuild.promise;
    }
  });

  await writeMarkdown(
    sandbox.defaultKnowledgeRoot,
    "README.md",
    "# Second Snapshot\n\nUpdated content.\n"
  );
  const updatedReadmePath = path.join(sandbox.defaultKnowledgeRoot, "README.md");
  const bumpedMtime = new Date(Date.now() + 2_000);
  await utimes(updatedReadmePath, bumpedMtime, bumpedMtime);

  invalidateKnowledgeBaseCache();

  const firstWarm = warmKnowledgeBase({ cwd: sandbox.cwd, env: {} });
  const secondWarm = warmKnowledgeBase({ cwd: sandbox.cwd, env: {} });
  releaseBuild.resolve();
  await Promise.all([firstWarm, secondWarm]);

  assert.equal(buildStarts.length, 1);
});

test("getKnowledgeBase joins an in-flight warmKnowledgeBase rebuild", async (t) => {
  const sandbox = await createSandbox();
  const buildStarts: string[] = [];
  const releaseBuild = Promise.withResolvers<void>();

  t.after(async () => {
    setKnowledgeBaseBuildObserverForTests(null);
    resetKnowledgeBaseCacheForTests();
    await sandbox.cleanup();
  });

  await writeMarkdown(
    sandbox.defaultKnowledgeRoot,
    "README.md",
    "# First Snapshot\n\nOriginal content.\n"
  );

  await getKnowledgeBase({
    cwd: sandbox.cwd,
    env: {},
  });

  setKnowledgeBaseBuildObserverForTests(async ({ phase }) => {
    if (phase === "start") {
      buildStarts.push("start");
      await releaseBuild.promise;
    }
  });

  await writeMarkdown(
    sandbox.defaultKnowledgeRoot,
    "README.md",
    "# Second Snapshot\n\nUpdated content.\n"
  );
  const updatedReadmePath = path.join(sandbox.defaultKnowledgeRoot, "README.md");
  const bumpedMtime = new Date(Date.now() + 2_000);
  await utimes(updatedReadmePath, bumpedMtime, bumpedMtime);

  invalidateKnowledgeBaseCache();

  const warmPromise = warmKnowledgeBase({ cwd: sandbox.cwd, env: {} });
  const readPromise = getKnowledgeBase({ cwd: sandbox.cwd, env: {} });
  releaseBuild.resolve();
  const [warmed, read] = await Promise.all([warmPromise, readPromise]);

  assert.equal(buildStarts.length, 1);
  assert.equal(warmed.status, "ready");
  assert.equal(read.status, "ready");
  assert.equal(warmed.index.root.document?.title, "Second Snapshot");
  assert.equal(read.index.root.document?.title, "Second Snapshot");
});

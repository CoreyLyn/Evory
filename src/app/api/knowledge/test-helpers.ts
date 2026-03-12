import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { resetKnowledgeBaseCacheForTests } from "@/lib/knowledge-base/service";

type CleanupContext = {
  after: (fn: () => void | Promise<void>) => void;
};

export async function createKnowledgeApiSandbox(t: CleanupContext) {
  const root = await mkdtemp(path.join(os.tmpdir(), "evory-knowledge-api-"));
  const knowledgeRoot = path.join(root, "knowledge");

  await mkdir(knowledgeRoot, { recursive: true });

  t.after(async () => {
    resetKnowledgeBaseCacheForTests();
    await rm(root, { recursive: true, force: true });
  });

  return {
    root,
    knowledgeRoot,
    missingKnowledgeRoot: path.join(root, "missing"),
  };
}

export async function writeKnowledgeMarkdown(
  root: string,
  relativePath: string,
  content: string
) {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

export function useKnowledgeBaseRoot(t: CleanupContext, rootDir: string) {
  const originalKnowledgeBaseDir = process.env.KNOWLEDGE_BASE_DIR;
  process.env.KNOWLEDGE_BASE_DIR = rootDir;
  resetKnowledgeBaseCacheForTests();

  t.after(() => {
    if (originalKnowledgeBaseDir === undefined) {
      delete process.env.KNOWLEDGE_BASE_DIR;
    } else {
      process.env.KNOWLEDGE_BASE_DIR = originalKnowledgeBaseDir;
    }
    resetKnowledgeBaseCacheForTests();
  });
}

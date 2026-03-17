import { stat } from "node:fs/promises";

import { resolveKnowledgeBaseRoot, type KnowledgeBaseConfigOptions } from "./config";
import { buildKnowledgeBaseIndex } from "./indexer";
import type { KnowledgeBaseState } from "./types";

type CachedKnowledgeBase = {
  cacheKey: string;
  value: KnowledgeBaseState;
};

let cachedKnowledgeBase: CachedKnowledgeBase | null = null;

function getCacheKey(rootDir: string) {
  return rootDir;
}

async function buildKnowledgeBaseState(
  options: KnowledgeBaseConfigOptions
): Promise<KnowledgeBaseState> {
  const rootDir = resolveKnowledgeBaseRoot(options);
  let rootStat;

  try {
    rootStat = await stat(rootDir);
  } catch {
    return {
      status: "not_configured",
      rootDir,
      index: null,
    };
  }

  if (!rootStat.isDirectory()) {
    return {
      status: "not_configured",
      rootDir,
      index: null,
    };
  }

  return {
    status: "ready",
    rootDir,
    index: await buildKnowledgeBaseIndex({ rootDir }),
  };
}

export async function getKnowledgeBase(
  options: KnowledgeBaseConfigOptions
): Promise<KnowledgeBaseState> {
  const rootDir = resolveKnowledgeBaseRoot(options);
  const cacheKey = getCacheKey(rootDir);

  if (cachedKnowledgeBase?.cacheKey === cacheKey) {
    return cachedKnowledgeBase.value;
  }

  const value = await buildKnowledgeBaseState(options);
  cachedKnowledgeBase = { cacheKey, value };
  return value;
}

export async function refreshKnowledgeBase(
  options: KnowledgeBaseConfigOptions
): Promise<KnowledgeBaseState> {
  const rootDir = resolveKnowledgeBaseRoot(options);
  const value = await buildKnowledgeBaseState(options);
  cachedKnowledgeBase = {
    cacheKey: getCacheKey(rootDir),
    value,
  };
  return value;
}

export function invalidateKnowledgeBaseCache() {
  cachedKnowledgeBase = null;
}

export function resetKnowledgeBaseCacheForTests() {
  cachedKnowledgeBase = null;
}

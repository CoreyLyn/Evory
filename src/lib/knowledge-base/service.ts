import { stat } from "node:fs/promises";

import { resolveKnowledgeBaseRoot, type KnowledgeBaseConfigOptions } from "./config";
import { buildKnowledgeBaseIndex } from "./indexer";
import type { KnowledgeBaseState } from "./types";

type CachedKnowledgeBase = {
  cacheKey: string;
  value: KnowledgeBaseState;
  dirty: boolean;
};

let cachedKnowledgeBase: CachedKnowledgeBase | null = null;

function getCacheKey(rootDir: string) {
  return rootDir;
}

async function buildKnowledgeBaseState(
  options: KnowledgeBaseConfigOptions,
  previousValue?: KnowledgeBaseState
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
    index: await buildKnowledgeBaseIndex({
      rootDir,
      previousIndex: previousValue?.status === "ready" ? previousValue.index : undefined,
    }),
  };
}

export async function getKnowledgeBase(
  options: KnowledgeBaseConfigOptions
): Promise<KnowledgeBaseState> {
  const rootDir = resolveKnowledgeBaseRoot(options);
  const cacheKey = getCacheKey(rootDir);

  if (cachedKnowledgeBase?.cacheKey === cacheKey && !cachedKnowledgeBase.dirty) {
    return cachedKnowledgeBase.value;
  }

  const previousValue = cachedKnowledgeBase?.cacheKey === cacheKey
    ? cachedKnowledgeBase.value
    : undefined;
  const value = await buildKnowledgeBaseState(options, previousValue);
  cachedKnowledgeBase = { cacheKey, value, dirty: false };
  return value;
}

export async function refreshKnowledgeBase(
  options: KnowledgeBaseConfigOptions
): Promise<KnowledgeBaseState> {
  const rootDir = resolveKnowledgeBaseRoot(options);
  const previousValue = cachedKnowledgeBase?.cacheKey === getCacheKey(rootDir)
    ? cachedKnowledgeBase.value
    : undefined;
  const value = await buildKnowledgeBaseState(options, previousValue);
  cachedKnowledgeBase = {
    cacheKey: getCacheKey(rootDir),
    value,
    dirty: false,
  };
  return value;
}

export function invalidateKnowledgeBaseCache() {
  if (!cachedKnowledgeBase) return;
  cachedKnowledgeBase = {
    ...cachedKnowledgeBase,
    dirty: true,
  };
}

export function resetKnowledgeBaseCacheForTests() {
  cachedKnowledgeBase = null;
}

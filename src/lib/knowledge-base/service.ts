import { stat } from "node:fs/promises";

import { resolveKnowledgeBaseRoot, type KnowledgeBaseConfigOptions } from "./config";
import { buildKnowledgeBaseIndex } from "./indexer";
import { startKnowledgeBaseWatcher, stopKnowledgeBaseWatcher } from "./watcher";
import type { KnowledgeBaseState } from "./types";

type CachedKnowledgeBase = {
  cacheKey: string;
  value: KnowledgeBaseState;
  dirty: boolean;
};

let cachedKnowledgeBase: CachedKnowledgeBase | null = null;
let rebuildInFlight: {
  cacheKey: string;
  promise: Promise<KnowledgeBaseState>;
} | null = null;
let buildObserverForTests: ((event: { phase: "start" | "finish"; cacheKey: string }) => void | Promise<void>) | null = null;

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

async function rebuildKnowledgeBase(
  options: KnowledgeBaseConfigOptions,
  cacheKey: string,
  previousValue?: KnowledgeBaseState
) {
  await buildObserverForTests?.({ phase: "start", cacheKey });

  try {
    const value = await buildKnowledgeBaseState(options, previousValue);
    cachedKnowledgeBase = { cacheKey, value, dirty: false };

    if (value.status === "ready" && process.env.NODE_ENV !== "test") {
      startKnowledgeBaseWatcher(value.rootDir);
    }

    return value;
  } finally {
    rebuildInFlight = null;
    await buildObserverForTests?.({ phase: "finish", cacheKey });
  }
}

function getOrStartRebuild(
  options: KnowledgeBaseConfigOptions,
  cacheKey: string,
  previousValue?: KnowledgeBaseState
) {
  if (rebuildInFlight?.cacheKey === cacheKey) {
    return rebuildInFlight.promise;
  }

  const promise = rebuildKnowledgeBase(options, cacheKey, previousValue);
  rebuildInFlight = {
    cacheKey,
    promise,
  };
  return promise;
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
  return getOrStartRebuild(options, cacheKey, previousValue);
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

export function warmKnowledgeBase(
  options: KnowledgeBaseConfigOptions
): Promise<KnowledgeBaseState> {
  const rootDir = resolveKnowledgeBaseRoot(options);
  const cacheKey = getCacheKey(rootDir);

  if (cachedKnowledgeBase?.cacheKey === cacheKey && !cachedKnowledgeBase.dirty) {
    return Promise.resolve(cachedKnowledgeBase.value);
  }

  const previousValue = cachedKnowledgeBase?.cacheKey === cacheKey
    ? cachedKnowledgeBase.value
    : undefined;
  return getOrStartRebuild(options, cacheKey, previousValue);
}

export function setKnowledgeBaseBuildObserverForTests(
  observer: ((event: { phase: "start" | "finish"; cacheKey: string }) => void | Promise<void>) | null
) {
  buildObserverForTests = observer;
}

export function resetKnowledgeBaseCacheForTests() {
  cachedKnowledgeBase = null;
  rebuildInFlight = null;
  buildObserverForTests = null;
  stopKnowledgeBaseWatcher();
}

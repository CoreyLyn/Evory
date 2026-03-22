import { watch, type FSWatcher } from "node:fs";
import path from "node:path";

import { invalidateKnowledgeBaseCache } from "./service";

let activeWatcher: FSWatcher | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const DEBOUNCE_MS = 500;

function isMarkdownFile(filename: string | null): boolean {
  if (!filename) return false;
  return filename.toLowerCase().endsWith(".md");
}

export function startKnowledgeBaseWatcher(rootDir: string): void {
  stopKnowledgeBaseWatcher();

  try {
    activeWatcher = watch(rootDir, { recursive: true }, (_eventType, filename) => {
      const resolved = typeof filename === "string" ? filename : null;
      if (!isMarkdownFile(resolved)) return;

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        invalidateKnowledgeBaseCache();
      }, DEBOUNCE_MS);
    });

    activeWatcher.on("error", () => {
      stopKnowledgeBaseWatcher();
    });
  } catch {
    // Directory may not exist or watching not supported
  }
}

export function stopKnowledgeBaseWatcher(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  if (activeWatcher) {
    activeWatcher.close();
    activeWatcher = null;
  }
}

export function isKnowledgeBaseWatcherActive(): boolean {
  return activeWatcher !== null;
}

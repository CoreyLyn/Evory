interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface MemoryCache {
  get<T = unknown>(key: string): T | null;
  set<T>(key: string, value: T, ttlMs: number): void;
  invalidate(prefix: string): void;
  clear(): void;
}

export function createCache(): MemoryCache {
  const store = new Map<string, CacheEntry<unknown>>();

  return {
    get<T>(key: string): T | null {
      const entry = store.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return entry.value as T;
    },

    set<T>(key: string, value: T, ttlMs: number): void {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },

    invalidate(prefix: string): void {
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
          store.delete(key);
        }
      }
    },

    clear(): void {
      store.clear();
    },
  };
}

export const apiCache = createCache();

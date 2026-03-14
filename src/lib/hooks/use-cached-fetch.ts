"use client";

import { useState, useEffect, useRef } from "react";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

interface UseCachedFetchOptions {
  ttl?: number;
}

interface UseCachedFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useCachedFetch<T = unknown>(
  url: string,
  options: UseCachedFetchOptions = {}
): UseCachedFetchResult<T> {
  const ttl = options.ttl ?? 5 * 60 * 1000;
  const [data, setData] = useState<T | null>(() => {
    const entry = cache.get(url);
    if (entry && Date.now() - entry.timestamp < ttl) {
      return entry.data as T;
    }
    return null;
  });
  const [loading, setLoading] = useState(data === null);
  const [error, setError] = useState<Error | null>(null);
  const fetchingRef = useRef(false);

  const doFetch = () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        cache.set(url, { data: json, timestamp: Date.now() });
        setData(json);
        setError(null);
      })
      .catch((err) => setError(err))
      .finally(() => {
        setLoading(false);
        fetchingRef.current = false;
      });
  };

  useEffect(() => {
    const entry = cache.get(url);
    if (entry && Date.now() - entry.timestamp < ttl) {
      setData(entry.data as T);
      setLoading(false);
      return;
    }
    doFetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return { data, loading, error, refresh: doFetch };
}

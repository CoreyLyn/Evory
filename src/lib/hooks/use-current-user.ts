"use client";

import { useState, useEffect, useRef } from "react";

interface CurrentUser {
  role: string;
  [key: string]: unknown;
}

interface UseCurrentUserResult {
  user: CurrentUser | null;
  isAdmin: boolean;
  loading: boolean;
}

let cachedUser: CurrentUser | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;

function initializeUser() {
  const now = Date.now();
  if (cachedUser && now - cacheTimestamp < CACHE_TTL) {
    return cachedUser;
  }
  return null;
}

export function useCurrentUser(): UseCurrentUserResult {
  const [user, setUser] = useState<CurrentUser | null>(initializeUser);
  const [loading, setLoading] = useState(false);
  const fetchingRef = useRef(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const now = Date.now();
    const isCacheValid = cachedUser && now - cacheTimestamp < CACHE_TTL;

    if (isCacheValid) {
      return;
    }

    if (fetchingRef.current) return;
    fetchingRef.current = true;

    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) {
          cachedUser = json.data;
          cacheTimestamp = Date.now();
          setUser(json.data);
        }
      })
      .catch(() => {})
      .finally(() => {
        setLoading(false);
        fetchingRef.current = false;
      });
  }, []);

  return {
    user,
    isAdmin: user?.role === "ADMIN",
    loading,
  };
}

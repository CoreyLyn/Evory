"use client";

import { clearCurrentUserCache } from "@/lib/hooks/use-current-user";

export async function logoutCurrentUser(): Promise<boolean> {
  try {
    const response = await fetch("/api/auth/logout", { method: "POST" });

    if (!response.ok) {
      return false;
    }

    clearCurrentUserCache();
    return true;
  } catch {
    return false;
  }
}

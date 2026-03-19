# User Logout UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a logout button to the sidebar so users can sign out of their account.

**Architecture:** The logout API (`POST /api/auth/logout`) already exists with CSRF protection, rate limiting, and session revocation. This plan only adds the frontend: i18n keys, a cache-clearing helper in `useCurrentUser`, and a logout button in the sidebar. On click, the button calls the API, clears the client-side user cache, and redirects to `/login`.

**Tech Stack:** React 19 · Next.js App Router · Tailwind CSS 4 · lucide-react · i18n (zh/en)

---

### Task 1: Add i18n translation keys for logout

**Files:**
- Modify: `src/i18n/zh.ts:12` (after `"nav.promptWiki"`)
- Modify: `src/i18n/en.ts:13` (after `"nav.promptWiki"`)

- [ ] **Step 1: Add Chinese translation key**

In `src/i18n/zh.ts`, add after `"nav.promptWiki": "Prompt Wiki",`:

```typescript
  "nav.logout": "退出登录",
```

- [ ] **Step 2: Add English translation key**

In `src/i18n/en.ts`, add after `"nav.promptWiki": "Prompt Wiki",`:

```typescript
  "nav.logout": "Log Out",
```

- [ ] **Step 3: Verify i18n check passes**

Run: `npm run i18n:check`
Expected: PASS (both zh and en have the same keys)

- [ ] **Step 4: Commit**

```bash
git add src/i18n/zh.ts src/i18n/en.ts
git commit -m "feat: add nav.logout i18n keys"
```

---

### Task 2: Add cache-clearing helper to useCurrentUser

**Files:**
- Modify: `src/lib/hooks/use-current-user.ts`
- Modify: `src/lib/hooks/use-current-user.test.ts` (existing test file)

- [ ] **Step 1: Write the failing test**

Add a new test case to the **existing** file `src/lib/hooks/use-current-user.test.ts`. Append inside the `describe("useCurrentUser module", ...)` block:

```typescript
  test("exports clearCurrentUserCache function", async () => {
    const mod = await import("./use-current-user");
    assert.equal(typeof mod.clearCurrentUserCache, "function");

    // Should not throw
    mod.clearCurrentUserCache();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/hooks/use-current-user.test.ts`
Expected: FAIL — `clearCurrentUserCache` is not exported

- [ ] **Step 3: Add clearCurrentUserCache export**

In `src/lib/hooks/use-current-user.ts`, add after the `CACHE_TTL` constant (line 18):

```typescript
export function clearCurrentUserCache() {
  cachedUser = null;
  cacheTimestamp = 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/lib/hooks/use-current-user.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/hooks/use-current-user.ts src/lib/hooks/use-current-user.test.ts
git commit -m "feat: add clearCurrentUserCache helper for logout"
```

---

### Task 3: Add logout button to sidebar

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

- [ ] **Step 1: Add LogOut icon import**

In `src/components/layout/sidebar.tsx`, add `LogOut` to the lucide-react imports (line 7):

```typescript
import {
  Moon,
  Sun,
  BarChart3,
  Building2,
  MessageSquare,
  BookOpen,
  CheckSquare,
  Bot,
  ShoppingBag,
  KeyRound,
  BookCopy,
  Shield,
  LogOut,
} from "lucide-react";
```

- [ ] **Step 2: Add useRouter and clearCurrentUserCache imports**

Add after the existing imports:

```typescript
import { useRouter } from "next/navigation";
import { clearCurrentUserCache } from "@/lib/hooks/use-current-user";
```

- [ ] **Step 3: Add useState import and logout handler inside Sidebar component**

Add a new import line `import { useState } from "react";` at the top of the file (there is no existing React import — the component uses JSX automatic transform). Then inside the `Sidebar` function, add after the existing hooks (after line 44):

```typescript
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (res.ok) {
        clearCurrentUserCache();
        router.push("/login");
        router.refresh();
      }
    } catch {
      // Silently fail — user can retry
    } finally {
      setLoggingOut(false);
    }
  }
```

- [ ] **Step 4: Add logout button to sidebar footer**

In the footer section (the `<div>` starting at line 134 with `border-t`), add a logout button between the theme/language controls and the footer text. Replace the footer `<div>` with:

```tsx
      <div className="border-t border-card-border/30 px-5 py-4 space-y-3">
        <div className="flex gap-2">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-card-border/50 text-muted transition-all duration-200 hover:border-card-border hover:text-foreground hover:bg-white/[0.03]"
            aria-label="Toggle theme"
          >
            <Sun className="h-4 w-4 scale-100 transition-all dark:scale-0 dark:hidden" />
            <Moon className="h-4 w-4 scale-0 hidden transition-all dark:scale-100 dark:block" />
          </button>

          <div className="flex flex-1 gap-2">
            {(["zh", "en"] as const).map((lang) => (
              <button
                key={lang}
                onClick={() => setLocale(lang)}
                className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-all duration-200 ${locale === lang
                  ? "bg-accent text-white shadow-[0_0_16px_rgba(255,107,74,0.25)]"
                  : "border border-card-border/50 text-muted hover:text-foreground hover:border-card-border"
                  }`}
              >
                {lang === "zh" ? "中文" : "EN"}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-card-border/50 py-1.5 text-xs font-medium text-muted transition-all duration-200 hover:border-danger/40 hover:text-danger hover:bg-danger/5 disabled:opacity-40 disabled:pointer-events-none"
        >
          <LogOut className="h-3.5 w-3.5" />
          {t("nav.logout")}
        </button>

        <p className="text-[11px] text-muted/50 text-center">
          {t("nav.footer")}
        </p>
      </div>
```

- [ ] **Step 5: Verify existing sidebar test still passes**

Run: `node --import tsx --test src/components/layout/sidebar.test.ts`
Expected: PASS (navItems order unchanged)

- [ ] **Step 6: Verify build passes**

Run: `npm run build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/sidebar.tsx
git commit -m "feat: add logout button to sidebar"
```

---

### Task 4: Manual smoke test

- [ ] **Step 1: Start dev server and verify**

Run: `npm run dev`

1. Open `http://localhost:3000`, log in
2. Verify the logout button appears in the sidebar footer (between language toggles and footer text)
3. Click logout — should redirect to `/login`
4. Verify the session cookie is cleared (cannot access authenticated pages)
5. Switch language to EN — verify button shows "Log Out"
6. Switch to dark mode — verify button styling works

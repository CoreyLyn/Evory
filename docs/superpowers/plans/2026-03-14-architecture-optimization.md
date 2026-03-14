# Architecture Optimization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve production stability, code quality, and performance through 12 targeted optimizations across 3 batches.

**Architecture:** Incremental improvement — each batch is independently deployable. Batch 1 addresses production-critical issues, Batch 2 improves code quality, Batch 3 adds enhancements. All changes maintain single-instance architecture, no new heavy dependencies.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind CSS 4, PostgreSQL, Prisma 7, TypeScript 5, Node.js native test runner

**Spec:** `docs/superpowers/specs/2026-03-14-architecture-optimization-design.md`

---

## Chunk 1: Batch 1 — High Priority (Production Stability)

### Task 1: Unified Error Handling — AppError + withErrorHandler

**Files:**
- Create: `src/lib/api-utils.ts`
- Create: `src/lib/api-utils.test.ts`

- [ ] **Step 1: Write failing tests for AppError and withErrorHandler**

```typescript
// src/lib/api-utils.test.ts
import assert from "node:assert/strict";
import test, { describe } from "node:test";

describe("AppError", () => {
  test("creates error with status, code, and message", async () => {
    const { AppError } = await import("./api-utils");
    const err = new AppError(404, "NOT_FOUND", "Resource not found");
    assert.equal(err.statusCode, 404);
    assert.equal(err.code, "NOT_FOUND");
    assert.equal(err.message, "Resource not found");
    assert.ok(err instanceof Error);
  });
});

describe("withErrorHandler", () => {
  test("passes through successful response", async () => {
    const { withErrorHandler } = await import("./api-utils");
    const handler = withErrorHandler(async () => {
      return Response.json({ success: true });
    });
    const req = new Request("http://localhost/test");
    const res = await handler(req as any);
    const body = await res.json();
    assert.equal(body.success, true);
  });

  test("catches AppError and returns structured response", async () => {
    const { withErrorHandler, AppError } = await import("./api-utils");
    const handler = withErrorHandler(async () => {
      throw new AppError(404, "NOT_FOUND", "Post not found");
    });
    const req = new Request("http://localhost/test");
    const res = await handler(req as any);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error, "Post not found");
    assert.equal(body.code, "NOT_FOUND");
  });

  test("catches unknown errors and returns 500", async () => {
    const { withErrorHandler } = await import("./api-utils");
    const handler = withErrorHandler(async () => {
      throw new Error("unexpected");
    });
    const req = new Request("http://localhost/test");
    const res = await handler(req as any);
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.equal(body.error, "Internal server error");
  });

  test("passes context to handler", async () => {
    const { withErrorHandler } = await import("./api-utils");
    const handler = withErrorHandler(async (_req, context) => {
      const params = await context.params;
      return Response.json({ id: params.id });
    });
    const req = new Request("http://localhost/test");
    const res = await handler(req as any, { params: Promise.resolve({ id: "123" }) });
    const body = await res.json();
    assert.equal(body.id, "123");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import tsx --test src/lib/api-utils.test.ts`
Expected: FAIL — module `./api-utils` not found

- [ ] **Step 3: Implement AppError and withErrorHandler**

```typescript
// src/lib/api-utils.ts
import { type NextRequest } from "next/server";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

// Next.js 16 route handler context type
type RouteContext = { params: Promise<Record<string, string>> };

type RouteHandler = (
  request: NextRequest,
  context?: RouteContext
) => Promise<Response>;

export function withErrorHandler(handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    try {
      return await handler(request, context ?? { params: Promise.resolve({}) });
    } catch (error) {
      if (error instanceof AppError) {
        return Response.json(
          { success: false, error: error.message, code: error.code },
          { status: error.statusCode }
        );
      }
      const url = new URL(request.url);
      console.error(
        `[${request.method} ${url.pathname}]`,
        error instanceof Error ? error.message : error
      );
      return Response.json(
        { success: false, error: "Internal server error" },
        { status: 500 }
      );
    }
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test src/lib/api-utils.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/api-utils.ts src/lib/api-utils.test.ts
git commit -m "feat: add AppError class and withErrorHandler utility"
```

**Note:** Migration of existing route handlers to use `withErrorHandler` is done incrementally as routes are touched for other changes. No bulk migration required.

---

### Task 2: Task State Machine

**Files:**
- Create: `src/lib/task-state-machine.ts`
- Create: `src/lib/task-state-machine.test.ts`
- Modify: `src/app/api/tasks/[id]/complete/route.ts:83` — migrate to updateMany + $transaction

- [ ] **Step 1: Write failing tests for state machine**

```typescript
// src/lib/task-state-machine.test.ts
import assert from "node:assert/strict";
import test, { describe } from "node:test";

describe("validateTransition", () => {
  test("allows OPEN -> CLAIMED", async () => {
    const { validateTransition } = await import("./task-state-machine");
    assert.equal(validateTransition("OPEN", "CLAIMED"), true);
  });

  test("allows OPEN -> CANCELLED", async () => {
    const { validateTransition } = await import("./task-state-machine");
    assert.equal(validateTransition("OPEN", "CANCELLED"), true);
  });

  test("allows CLAIMED -> OPEN (unclaim)", async () => {
    const { validateTransition } = await import("./task-state-machine");
    assert.equal(validateTransition("CLAIMED", "OPEN"), true);
  });

  test("allows CLAIMED -> COMPLETED", async () => {
    const { validateTransition } = await import("./task-state-machine");
    assert.equal(validateTransition("CLAIMED", "COMPLETED"), true);
  });

  test("allows CLAIMED -> CANCELLED", async () => {
    const { validateTransition } = await import("./task-state-machine");
    assert.equal(validateTransition("CLAIMED", "CANCELLED"), true);
  });

  test("allows COMPLETED -> VERIFIED", async () => {
    const { validateTransition } = await import("./task-state-machine");
    assert.equal(validateTransition("COMPLETED", "VERIFIED"), true);
  });

  test("allows COMPLETED -> CLAIMED (rejection)", async () => {
    const { validateTransition } = await import("./task-state-machine");
    assert.equal(validateTransition("COMPLETED", "CLAIMED"), true);
  });

  test("rejects OPEN -> COMPLETED (skip)", async () => {
    const { validateTransition } = await import("./task-state-machine");
    assert.equal(validateTransition("OPEN", "COMPLETED"), false);
  });

  test("rejects OPEN -> VERIFIED (skip)", async () => {
    const { validateTransition } = await import("./task-state-machine");
    assert.equal(validateTransition("OPEN", "VERIFIED"), false);
  });

  test("rejects VERIFIED -> anything (terminal)", async () => {
    const { validateTransition } = await import("./task-state-machine");
    assert.equal(validateTransition("VERIFIED", "OPEN"), false);
    assert.equal(validateTransition("VERIFIED", "CLAIMED"), false);
    assert.equal(validateTransition("VERIFIED", "COMPLETED"), false);
    assert.equal(validateTransition("VERIFIED", "CANCELLED"), false);
  });

  test("rejects CANCELLED -> anything (terminal)", async () => {
    const { validateTransition } = await import("./task-state-machine");
    assert.equal(validateTransition("CANCELLED", "OPEN"), false);
    assert.equal(validateTransition("CANCELLED", "CLAIMED"), false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import tsx --test src/lib/task-state-machine.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement state machine**

```typescript
// src/lib/task-state-machine.ts
import { TaskStatus } from "@/generated/prisma";

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.OPEN]: [TaskStatus.CLAIMED, TaskStatus.CANCELLED],
  [TaskStatus.CLAIMED]: [TaskStatus.OPEN, TaskStatus.COMPLETED, TaskStatus.CANCELLED],
  [TaskStatus.COMPLETED]: [TaskStatus.VERIFIED, TaskStatus.CLAIMED],
  [TaskStatus.VERIFIED]: [],
  [TaskStatus.CANCELLED]: [],
};

export function validateTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from as TaskStatus];
  if (!allowed) return false;
  return allowed.includes(to as TaskStatus);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test src/lib/task-state-machine.test.ts`
Expected: All 12 tests PASS

- [ ] **Step 5: Commit state machine**

```bash
git add src/lib/task-state-machine.ts src/lib/task-state-machine.test.ts
git commit -m "feat: add task state machine with transition validation"
```

- [ ] **Step 6: Migrate complete route to updateMany + $transaction**

Modify `src/app/api/tasks/[id]/complete/route.ts`. Replace the `prisma.task.update()` call (around line 83) with the optimistic lock pattern from the claim route:

```typescript
// Replace:
//   const updated = await prisma.task.update({
//     where: { id },
//     data: { status: TaskStatus.COMPLETED, completedAt: new Date() },
//     select: { ... }
//   });

// With:
const updated = await prisma.$transaction(async (tx) => {
  const result = await tx.task.updateMany({
    where: { id, status: TaskStatus.CLAIMED },
    data: { status: TaskStatus.COMPLETED, completedAt: new Date() },
  });
  if (result.count !== 1) return null;
  return tx.task.findUniqueOrThrow({
    where: { id },
    select: { /* keep existing select fields */ },
  });
});

if (!updated) {
  return notForAgentsResponse(
    Response.json(
      { success: false, error: "Task status conflict" },
      { status: 409 }
    )
  );
}
```

Also add the `validateTransition` import and use it for an early check before the transaction:

```typescript
import { validateTransition } from "@/lib/task-state-machine";

// Early validation (before the transaction):
const task = await prisma.task.findUnique({ where: { id }, select: { status: true } });
if (task && !validateTransition(task.status, TaskStatus.COMPLETED)) {
  return notForAgentsResponse(
    Response.json(
      { success: false, error: `Cannot transition from ${task.status} to COMPLETED` },
      { status: 400 }
    )
  );
}
```

- [ ] **Step 7: Run full test suite to check for regressions**

Run: `npm test`
Expected: All tests PASS (note: there is no dedicated test file for the complete route — regression coverage comes from workflow-level tests)

- [ ] **Step 8: Commit complete route migration**

```bash
git add src/app/api/tasks/[id]/complete/route.ts
git commit -m "fix: migrate task complete route to updateMany with optimistic lock"
```

---

### Task 3: Rate Limit Race Condition Fix

**Files:**
- Modify: `src/lib/rate-limit-store.ts:42-86` — combine deleteMany + upsert into raw SQL

- [ ] **Step 1: Read the current implementation**

Read `src/lib/rate-limit-store.ts` fully to understand the composite unique key `bucketId_subjectKey_windowStart` and the `RateLimitCounter` table columns.

- [ ] **Step 2: Verify existing rate-limit tests pass before changes**

Run: `node --import tsx --test src/lib/rate-limit.test.ts`
Expected: All existing tests PASS (baseline)

- [ ] **Step 3: Wrap deleteMany + upsert in a serialized transaction**

In `src/lib/rate-limit-store.ts`, the current code (lines 42-86) calls `deleteMany` and `upsert` as two separate awaited calls. Wrap them in a single function that uses `rateLimitPrisma` consistently (preserving the existing type-cast pattern). Since `rateLimitPrisma` doesn't expose `$transaction`, use the real `prisma` import (already available at line 1) for the transaction wrapper:

```typescript
export async function consumeDurableRateLimitCounter(
  config: ConsumeDurableRateLimitConfig
): Promise<DurableRateLimitWindow> {
  const now = config.now ?? Date.now();
  const { windowStart, windowEnd } = getRateLimitWindow(now, config.windowMs);
  const windowStartDate = new Date(windowStart);
  const windowEndDate = new Date(windowEnd);

  // Wrap both operations in a transaction to eliminate the race window
  // between deleteMany (clearing expired) and upsert (incrementing)
  const counter = await prisma.$transaction(async (tx) => {
    await tx.rateLimitCounter.deleteMany({
      where: {
        windowEnd: { lte: new Date(now) },
      },
    });

    return tx.rateLimitCounter.upsert({
      where: {
        bucketId_subjectKey_windowStart: {
          bucketId: config.bucketId,
          subjectKey: config.subjectKey,
          windowStart: windowStartDate,
        },
      },
      create: {
        bucketId: config.bucketId,
        subjectKey: config.subjectKey,
        windowStart: windowStartDate,
        windowEnd: windowEndDate,
        count: 1,
      },
      update: {
        count: { increment: 1 },
        updatedAt: new Date(now),
      },
    });
  });

  return {
    count: counter.count,
    resetAt: toTimestamp(counter.windowEnd),
    windowStart,  // already a number from getRateLimitWindow
  };
}
```

Key changes from original:
- `prisma.$transaction` wraps both `deleteMany` and `upsert` (uses real prisma, not the type-cast `rateLimitPrisma`)
- The `rateLimitPrisma` type-cast and its usage are removed since `$transaction` provides typed tx client directly
- Return values use `toTimestamp()` for `resetAt` (preserving `number` return type) and `windowStart` is already a `number`
- The `RateLimitStorePrismaClient` type and `rateLimitPrisma` cast can be removed as they're no longer needed

- [ ] **Step 4: Run existing rate limit tests**

Run: `node --import tsx --test src/lib/rate-limit.test.ts`
Expected: All existing tests PASS (interface unchanged)

- [ ] **Step 5: Commit**

```bash
git add src/lib/rate-limit-store.ts
git commit -m "fix: wrap rate limit deleteMany+upsert in transaction to eliminate race"
```

---

### Task 4: Sidebar — useCurrentUser Hook

**Files:**
- Create: `src/lib/hooks/use-current-user.ts`
- Create: `src/lib/hooks/use-current-user.test.ts`
- Modify: `src/components/layout/sidebar.tsx:46-55`

- [ ] **Step 1: Create hooks directory and write failing test**

```typescript
// src/lib/hooks/use-current-user.test.ts
import assert from "node:assert/strict";
import test, { describe } from "node:test";

describe("useCurrentUser module", () => {
  test("exports useCurrentUser hook", async () => {
    const mod = await import("./use-current-user");
    assert.equal(typeof mod.useCurrentUser, "function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/hooks/use-current-user.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement useCurrentUser hook**

```typescript
// src/lib/hooks/use-current-user.ts
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

// Module-level cache shared across all component instances
let cachedUser: CurrentUser | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useCurrentUser(): UseCurrentUserResult {
  const [user, setUser] = useState<CurrentUser | null>(cachedUser);
  const [loading, setLoading] = useState(cachedUser === null);
  const fetchingRef = useRef(false);

  useEffect(() => {
    const now = Date.now();
    if (cachedUser && now - cacheTimestamp < CACHE_TTL) {
      setUser(cachedUser);
      setLoading(false);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/lib/hooks/use-current-user.test.ts`
Expected: PASS

- [ ] **Step 5: Update Sidebar to use the hook**

In `src/components/layout/sidebar.tsx`, replace lines 46-55:

```typescript
// Remove:
//   const [isAdmin, setIsAdmin] = useState(false);
//   useEffect(() => {
//     fetch("/api/auth/me")
//       .then((r) => r.json())
//       .then((json) => {
//         if (json.success && json.data?.role === "ADMIN") {
//           setIsAdmin(true);
//         }
//       })
//       .catch(() => {});
//   }, []);

// Add import at top:
import { useCurrentUser } from "@/lib/hooks/use-current-user";

// Replace in component body:
const { isAdmin } = useCurrentUser();
```

- [ ] **Step 6: Run full test suite to verify no regressions**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/hooks/use-current-user.ts src/lib/hooks/use-current-user.test.ts src/components/layout/sidebar.tsx
git commit -m "feat: add useCurrentUser hook with module-level cache, update sidebar"
```

---

## Chunk 2: Batch 2 — Code Quality

### Task 5: Remove Unused socket.io Dependencies

**Files:**
- Modify: `package.json` (remove socket.io entries)

- [ ] **Step 1: Verify no imports exist**

Run: `grep -r "socket.io" src/ --include="*.ts" --include="*.tsx"`
Expected: No matches (confirming socket.io is unused in source code)

- [ ] **Step 2: Uninstall dependencies**

Run: `npm uninstall socket.io socket.io-client`

- [ ] **Step 3: Verify build still works**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove unused socket.io dependencies"
```

---

### Task 6: Extract Tailwind Design Tokens via @theme

**Files:**
- Modify: `src/app/globals.css:108-128` — add shadow and gradient tokens to @theme

- [ ] **Step 1: Search for repeated inline styles**

Search for box-shadow patterns used 3+ times across components:

Run: `grep -r "shadow-\[" src/components/ --include="*.tsx" -h | sort | uniq -c | sort -rn | head -20`

Search for repeated gradients:

Run: `grep -r "bg-gradient" src/components/ --include="*.tsx" -h | sort | uniq -c | sort -rn | head -20`

Document the patterns that appear 3+ times.

- [ ] **Step 2: Add tokens to globals.css @theme block**

Extend the existing `@theme inline` block in `src/app/globals.css` (line 108) with the identified repeated tokens. Example additions:

```css
@theme inline {
  /* ... existing color tokens ... */

  /* Add repeated shadow tokens */
  --shadow-card: 0 8px 20px -6px rgba(0,0,0,0.1);
  --shadow-card-inset: inset 0 1px 0 rgba(255,255,255,0.02), 0 8px 20px -6px rgba(0,0,0,0.1);

  /* Add repeated gradient tokens - use CSS custom properties */
  /* Note: Tailwind v4 @theme supports custom properties that can be used in utilities */
}
```

The exact tokens to add depend on Step 1 findings. Only add tokens that appear 3+ times.

- [ ] **Step 3: Replace inline styles in components**

Replace the long inline shadow/gradient strings with the new semantic tokens.

- [ ] **Step 4: Verify visual correctness**

Run: `npm run dev` and manually verify the UI looks correct.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/components/
git commit -m "refactor: extract repeated Tailwind styles into @theme tokens"
```

---

### Task 7: i18n Key Consistency Validation Script

**Files:**
- Create: `src/i18n/validate-keys.ts`
- Modify: `package.json` — add `i18n:check` script

- [ ] **Step 1: Write the validation script**

```typescript
// src/i18n/validate-keys.ts
import { zh } from "./zh";
import { en } from "./en";

function flattenKeys(obj: Record<string, string>, prefix = ""): Set<string> {
  const keys = new Set<string>();
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    keys.add(fullKey);
  }
  return keys;
}

const zhKeys = flattenKeys(zh);
const enKeys = flattenKeys(en);

const missingInEn = [...zhKeys].filter((k) => !enKeys.has(k));
const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k));

let hasErrors = false;

if (missingInEn.length > 0) {
  console.error("Keys in zh.ts but missing in en.ts:");
  missingInEn.forEach((k) => console.error(`  - ${k}`));
  hasErrors = true;
}

if (missingInZh.length > 0) {
  console.error("Keys in en.ts but missing in zh.ts:");
  missingInZh.forEach((k) => console.error(`  - ${k}`));
  hasErrors = true;
}

if (hasErrors) {
  process.exit(1);
} else {
  console.log(`i18n keys are consistent (${zhKeys.size} keys in both languages)`);
}
```

Note: zh.ts and en.ts use flat key strings (e.g., `"nav.forum": "论坛"`), not nested objects, so `flattenKeys` simply iterates `Object.keys()`.

- [ ] **Step 2: Add npm script**

In `package.json`, add to `"scripts"`:
```json
"i18n:check": "node --import tsx src/i18n/validate-keys.ts"
```

- [ ] **Step 3: Run the script**

Run: `npm run i18n:check`
Expected: Either "keys are consistent" or a list of missing keys to fix

- [ ] **Step 4: Fix any missing keys found**

If the script reveals missing keys, add them to the appropriate language file.

- [ ] **Step 5: Commit**

```bash
git add src/i18n/validate-keys.ts package.json
git commit -m "feat: add i18n key consistency validation script"
```

---

### Task 8: Type File Split

**Files:**
- Create: `src/types/api.ts`
- Create: `src/types/domain.ts`
- Create: `src/lib/constants.ts`
- Modify: `src/types/index.ts` — convert to barrel re-export

- [ ] **Step 1: Read current types/index.ts**

Read `src/types/index.ts` to identify exact exports to split.

Current contents (46 lines):
- `ApiResponse<T>` interface (with pagination)
- `AgentPublic` interface
- `OfficeEvent` interface
- `POINT_RULES` const
- `DAILY_LIMITS` const

- [ ] **Step 2: Create src/types/api.ts**

```typescript
// src/types/api.ts
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  pagination?: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}
```

- [ ] **Step 3: Create src/types/domain.ts**

```typescript
// src/types/domain.ts
export interface AgentPublic {
  id: string;
  name: string;
  type: string;
  status: string;
  points: number;
  avatarConfig: Record<string, unknown>;
  bio: string;
  createdAt: string;
}

export interface OfficeEvent {
  type:
    | "agent_join"
    | "agent_leave"
    | "agent_status_change"
    | "agent_move";
  agentId: string;
  data: Record<string, unknown>;
  timestamp: number;
}
```

- [ ] **Step 4: Create src/lib/constants.ts**

```typescript
// src/lib/constants.ts
export const POINT_RULES = {
  DAILY_LOGIN: 10,
  CREATE_POST: 5,
  RECEIVE_REPLY: 2,
  RECEIVE_LIKE: 1,
  COMPLETE_TASK: 5,
} as const;

export const DAILY_LIMITS = {
  CREATE_POST: 10,
} as const;
```

- [ ] **Step 5: Convert src/types/index.ts to barrel re-export**

```typescript
// src/types/index.ts
export type { ApiResponse } from "./api";
export type { AgentPublic, OfficeEvent } from "./domain";
export { POINT_RULES, DAILY_LIMITS } from "@/lib/constants";
```

- [ ] **Step 6: Run full test suite to verify no regressions**

Run: `npm test`
Expected: All tests PASS (barrel re-export preserves all import paths)

- [ ] **Step 7: Run build to verify**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 8: Commit**

```bash
git add src/types/api.ts src/types/domain.ts src/lib/constants.ts src/types/index.ts
git commit -m "refactor: split types/index.ts into api, domain, and constants modules"
```

---

## Chunk 3: Batch 3 — Enhancements

### Task 9: E2E Tests with Playwright

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/auth-flow.spec.ts`
- Modify: `package.json` — add Playwright dev dependency and scripts

- [ ] **Step 1: Install Playwright**

Run: `npm install -D @playwright/test`
Run: `npx playwright install chromium`

- [ ] **Step 2: Create Playwright config**

```typescript
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
  },
});
```

- [ ] **Step 3: Add npm script**

In `package.json`, add:
```json
"test:e2e": "playwright test"
```

- [ ] **Step 4: Write first E2E test — auth flow**

```typescript
// e2e/auth-flow.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Authentication Flow", () => {
  test("can view login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveTitle(/Evory/);
  });
});
```

Start with a minimal smoke test. Additional E2E tests for full flows (register → login → create agent → API key) should be added incrementally as the test infrastructure is validated.

- [ ] **Step 5: Add e2e to ESLint/gitignore if needed**

Add `e2e/` to ESLint config if needed, and ensure `test-results/` and `playwright-report/` are in `.gitignore`.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts e2e/ package.json package-lock.json .gitignore
git commit -m "feat: add Playwright E2E test infrastructure with auth smoke test"
```

---

### Task 10: Client-Side Cached Fetch Hook

**Files:**
- Create: `src/lib/hooks/use-cached-fetch.ts`
- Create: `src/lib/hooks/use-cached-fetch.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/lib/hooks/use-cached-fetch.test.ts
import assert from "node:assert/strict";
import test, { describe } from "node:test";

describe("useCachedFetch module", () => {
  test("exports useCachedFetch hook", async () => {
    const mod = await import("./use-cached-fetch");
    assert.equal(typeof mod.useCachedFetch, "function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/hooks/use-cached-fetch.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement useCachedFetch**

```typescript
// src/lib/hooks/use-cached-fetch.ts
"use client";

import { useState, useEffect, useRef } from "react";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// Module-level cache
const cache = new Map<string, CacheEntry<unknown>>();

interface UseCachedFetchOptions {
  ttl?: number; // milliseconds, default 5 minutes
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
  }, [url]);

  return { data, loading, error, refresh: doFetch };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/lib/hooks/use-cached-fetch.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/hooks/use-cached-fetch.ts src/lib/hooks/use-cached-fetch.test.ts
git commit -m "feat: add useCachedFetch hook with module-level cache and TTL"
```

---

### Task 11: Point Config Database Table + Admin API

**Files:**
- Modify: `prisma/schema.prisma` — add PointConfig model
- Create: `src/app/api/admin/point-config/route.ts`
- Create: `src/app/api/admin/point-config/route.test.ts`
- Modify: `src/lib/points.ts` — load config from DB with fallback

- [ ] **Step 1: Add PointConfig model to Prisma schema**

```prisma
model PointConfig {
  id          String   @id @default(uuid())
  action      String   @unique  // e.g. "DAILY_LOGIN", "CREATE_POST"
  points      Int
  dailyLimit  Int?     // null means no daily limit
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

- [ ] **Step 2: Run Prisma generate and push**

Run: `npm run prisma:generate && npm run db:push`

- [ ] **Step 3: Write failing test for admin route**

```typescript
// src/app/api/admin/point-config/route.test.ts
import assert from "node:assert/strict";
import test, { describe } from "node:test";

describe("GET /api/admin/point-config", () => {
  test("returns 401 without session", async () => {
    const { GET } = await import("./route");
    const { createRouteRequest } = await import("@/test/request-helpers");
    const request = createRouteRequest("/api/admin/point-config");
    const response = await GET(request);
    assert.equal(response.status, 401);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `node --import tsx --test src/app/api/admin/point-config/route.test.ts`
Expected: FAIL

- [ ] **Step 5: Implement admin point-config route**

```typescript
// src/app/api/admin/point-config/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAdmin } from "@/lib/user-auth";
import { enforceSameOriginControlPlaneRequest } from "@/lib/csrf";
import { enforceRateLimit } from "@/lib/rate-limit";
import { notForAgentsResponse } from "@/lib/api-helpers";
import { POINT_RULES, DAILY_LIMITS } from "@/types";

export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  const configs = await prisma.pointConfig.findMany({
    orderBy: { action: "asc" },
  });

  // Merge DB configs with code defaults as fallback
  const defaults = Object.entries(POINT_RULES).map(([action, points]) => ({
    action,
    points,
    dailyLimit: (DAILY_LIMITS as Record<string, number>)[action] ?? null,
    source: "default" as const,
  }));

  const merged = defaults.map((d) => {
    const dbConfig = configs.find((c) => c.action === d.action);
    return dbConfig
      ? { ...dbConfig, source: "database" as const }
      : d;
  });

  return notForAgentsResponse(
    Response.json({ success: true, data: merged })
  );
}

export async function PUT(request: NextRequest) {
  const csrfBlocked = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-point-config",
  });
  if (csrfBlocked) return notForAgentsResponse(csrfBlocked);

  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  const rateLimited = await enforceRateLimit({
    request,
    bucketId: "admin-point-config",
    maxRequests: 20,
    windowMs: 10 * 60 * 1000,
    routeKey: "admin-point-config",
  });
  if (rateLimited) return notForAgentsResponse(rateLimited);

  const body = await request.json();
  const { action, points, dailyLimit, description } = body;

  if (!action || typeof points !== "number") {
    return notForAgentsResponse(
      Response.json(
        { success: false, error: "action and points are required" },
        { status: 400 }
      )
    );
  }

  const config = await prisma.pointConfig.upsert({
    where: { action },
    create: { action, points, dailyLimit, description },
    update: { points, dailyLimit, description },
  });

  return notForAgentsResponse(
    Response.json({ success: true, data: config })
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --import tsx --test src/app/api/admin/point-config/route.test.ts`
Expected: PASS

- [ ] **Step 7: Modify points.ts to load from DB with fallback**

In `src/lib/points.ts`, add a cached config loader:

```typescript
import { POINT_RULES, DAILY_LIMITS } from "@/types";

let configCache: Record<string, { points: number; dailyLimit: number | null }> | null = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getPointConfig(action: string): Promise<{ points: number; dailyLimit: number | null }> {
  const now = Date.now();
  if (!configCache || now - configCacheTime > CONFIG_CACHE_TTL) {
    try {
      const configs = await prisma.pointConfig.findMany();
      configCache = {};
      for (const c of configs) {
        configCache[c.action] = { points: c.points, dailyLimit: c.dailyLimit };
      }
      configCacheTime = now;
    } catch {
      configCache = null; // fall through to defaults
    }
  }

  if (configCache?.[action]) return configCache[action];

  // Fallback to code defaults
  const defaultPoints = (POINT_RULES as Record<string, number>)[action] ?? 0;
  const defaultLimit = (DAILY_LIMITS as Record<string, number>)[action] ?? null;
  return { points: defaultPoints, dailyLimit: defaultLimit };
}
```

Then use `getPointConfig(type)` in `awardPoints` to get the points value instead of directly reading `POINT_RULES`.

- [ ] **Step 8: Run existing points tests**

Run: `node --import tsx --test src/lib/points.test.ts`
Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma src/app/api/admin/point-config/ src/lib/points.ts
git commit -m "feat: add PointConfig table and admin API for configurable point rules"
```

---

### Task 12: API Response Cache

**Files:**
- Create: `src/lib/cache.ts`
- Create: `src/lib/cache.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/cache.test.ts
import assert from "node:assert/strict";
import test, { describe, beforeEach } from "node:test";

describe("MemoryCache", () => {
  test("get returns null for missing key", async () => {
    const { createCache } = await import("./cache");
    const cache = createCache();
    assert.equal(cache.get("missing"), null);
  });

  test("set and get within TTL", async () => {
    const { createCache } = await import("./cache");
    const cache = createCache();
    cache.set("key", { value: 42 }, 60_000);
    assert.deepEqual(cache.get("key"), { value: 42 });
  });

  test("returns null after TTL expires", async () => {
    const { createCache } = await import("./cache");
    const cache = createCache();
    cache.set("key", "data", 1); // 1ms TTL
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(cache.get("key"), null);
  });

  test("invalidate removes matching keys", async () => {
    const { createCache } = await import("./cache");
    const cache = createCache();
    cache.set("forum:posts:1", "a", 60_000);
    cache.set("forum:posts:2", "b", 60_000);
    cache.set("tasks:list", "c", 60_000);
    cache.invalidate("forum:posts");
    assert.equal(cache.get("forum:posts:1"), null);
    assert.equal(cache.get("forum:posts:2"), null);
    assert.deepEqual(cache.get("tasks:list"), "c");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import tsx --test src/lib/cache.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement cache module**

```typescript
// src/lib/cache.ts
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

// Singleton instance for API route use
export const apiCache = createCache();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import tsx --test src/lib/cache.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/cache.ts src/lib/cache.test.ts
git commit -m "feat: add in-memory cache module with TTL and prefix invalidation"
```

**Note:** Integration of `apiCache` into specific API routes (forum posts, knowledge docs, shop items) is done incrementally as those routes are touched. Each integration adds `apiCache.get/set` to the GET handler and `apiCache.invalidate` to the corresponding write handlers.

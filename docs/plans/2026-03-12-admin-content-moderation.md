# Admin Content Moderation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add admin content moderation — an ADMIN user can hide/restore forum posts and replies via a dedicated `/admin` page; hidden content is invisible to all non-admin users and Agent APIs.

**Architecture:** Single `role` field on User model (`"USER"` | `"ADMIN"`). Soft-delete via `hiddenAt`/`hiddenById` on ForumPost and ForumReply. New `authenticateAdmin()` guard in `src/lib/admin-auth.ts`. Five admin API routes under `/api/admin/`. Existing forum queries gain `hiddenAt: null` filter. Standalone `/admin` page for content moderation UI.

**Tech Stack:** Next.js 16 App Router, Prisma 7, Node.js native test runner, Tailwind CSS 4, Lucide React icons, i18n via `useT()`

---

### Task 1: Prisma Schema Changes

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/security-events.ts:3-9` (VALID_SECURITY_EVENT_TYPES)

**Step 1: Update Prisma schema**

Add `role` to User, `hiddenAt`/`hiddenById` to ForumPost and ForumReply, new SecurityEventType values:

```prisma
// In User model, after `updatedAt` field:
  role          String        @default("USER")
  hiddenPosts   ForumPost[]   @relation("HiddenPosts")
  hiddenReplies ForumReply[]  @relation("HiddenReplies")

// In ForumPost model, after `updatedAt` field:
  hiddenAt    DateTime?
  hiddenById  String?
  hiddenBy    User?     @relation("HiddenPosts", fields: [hiddenById], references: [id])

// In ForumReply model, after `createdAt` field:
  hiddenAt    DateTime?
  hiddenById  String?
  hiddenBy    User?     @relation("HiddenReplies", fields: [hiddenById], references: [id])

// In SecurityEventType enum, add:
  CONTENT_HIDDEN
  CONTENT_RESTORED
```

**Step 2: Run migration**

```bash
npm run db:migrate -- --name add-admin-content-moderation
```

Expected: Migration created and applied successfully.

**Step 3: Generate Prisma Client**

```bash
npm run prisma:generate
```

Expected: Prisma Client regenerated.

**Step 4: Update VALID_SECURITY_EVENT_TYPES**

In `src/lib/security-events.ts`, add `"CONTENT_HIDDEN"` and `"CONTENT_RESTORED"` to the `VALID_SECURITY_EVENT_TYPES` array.

**Step 5: Commit**

```bash
git add prisma/schema.prisma src/lib/security-events.ts src/generated/prisma/
git commit -m "feat: add admin content moderation schema (role, hiddenAt, SecurityEventType)"
```

---

### Task 2: Update User Auth to Include Role

**Files:**
- Modify: `src/lib/user-auth.ts:15-18` (AuthenticatedUser type)

**Step 1: Write the failing test**

Add a test in `src/lib/user-auth.test.ts` (or add to existing test) that verifies `authenticateUser()` returns a user object with `role` field:

```typescript
import assert from "node:assert/strict";
import test from "node:test";

test("authenticateUser returns user with role field", async () => {
  // Mock setup: create a user session with user that has role "ADMIN"
  // Call authenticateUser
  // Assert result includes role: "ADMIN"
});
```

Since `authenticateUser` already does `include: { user: true }`, the Prisma query already returns all User fields including the new `role`. The fix is just updating the TypeScript type.

**Step 2: Update AuthenticatedUser type**

In `src/lib/user-auth.ts`, update the type:

```typescript
type AuthenticatedUser = {
  id: string;
  email: string;
  name?: string | null;
  role: string;
};
```

**Step 3: Run existing tests to verify nothing breaks**

```bash
node --import tsx --test src/app/api/auth/auth-workflow.test.ts
```

Expected: All existing auth tests pass.

**Step 4: Commit**

```bash
git add src/lib/user-auth.ts
git commit -m "feat: include role in AuthenticatedUser type"
```

---

### Task 3: Admin Auth Guard + Tests

**Files:**
- Create: `src/lib/admin-auth.ts`
- Create: `src/lib/admin-auth.test.ts`

**Step 1: Write the failing tests**

Create `src/lib/admin-auth.test.ts`:

```typescript
import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { createRouteRequest } from "@/test/request-helpers";
import { createUserFixture, createUserSessionFixture } from "@/test/factories";
import prisma from "@/lib/prisma";
import { hashSessionToken } from "@/lib/user-auth";

const prismaClient = prisma as Record<string, any>;
let origUserSession: unknown;

beforeEach(() => {
  origUserSession = prismaClient.userSession;
});

afterEach(() => {
  prismaClient.userSession = origUserSession;
});

test("authenticateAdmin returns user when role is ADMIN", async () => {
  const { authenticateAdmin } = await import("@/lib/admin-auth");
  prismaClient.userSession = {
    findUnique: async () =>
      createUserSessionFixture({
        user: createUserFixture({ role: "ADMIN" }),
      }),
    deleteMany: async () => ({ count: 0 }),
  };

  const request = createRouteRequest("http://localhost/api/admin/forum/posts", {
    headers: { cookie: "evory_user_session=valid-token" },
  });

  const result = await authenticateAdmin(request);
  assert.equal(result.type, "ok");
  assert.equal(result.user.role, "ADMIN");
});

test("authenticateAdmin returns 401 when not logged in", async () => {
  const { authenticateAdmin } = await import("@/lib/admin-auth");

  const request = createRouteRequest("http://localhost/api/admin/forum/posts");
  const result = await authenticateAdmin(request);
  assert.equal(result.type, "error");
  assert.equal(result.response.status, 401);
});

test("authenticateAdmin returns 403 when role is USER", async () => {
  const { authenticateAdmin } = await import("@/lib/admin-auth");
  prismaClient.userSession = {
    findUnique: async () =>
      createUserSessionFixture({
        user: createUserFixture({ role: "USER" }),
      }),
    deleteMany: async () => ({ count: 0 }),
  };

  const request = createRouteRequest("http://localhost/api/admin/forum/posts", {
    headers: { cookie: "evory_user_session=valid-token" },
  });

  const result = await authenticateAdmin(request);
  assert.equal(result.type, "error");
  assert.equal(result.response.status, 403);
});
```

**Step 2: Run tests to verify they fail**

```bash
node --import tsx --test src/lib/admin-auth.test.ts
```

Expected: FAIL — module `@/lib/admin-auth` does not exist.

**Step 3: Implement admin-auth.ts**

Create `src/lib/admin-auth.ts`:

```typescript
import { NextRequest } from "next/server";
import { authenticateUser } from "@/lib/user-auth";

type AuthenticatedAdmin = {
  id: string;
  email: string;
  name?: string | null;
  role: string;
};

type AdminAuthResult =
  | { type: "ok"; user: AuthenticatedAdmin }
  | { type: "error"; response: Response };

export async function authenticateAdmin(
  request: NextRequest
): Promise<AdminAuthResult> {
  const user = await authenticateUser(request);

  if (!user) {
    return {
      type: "error",
      response: Response.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      ),
    };
  }

  if (user.role !== "ADMIN") {
    return {
      type: "error",
      response: Response.json(
        { success: false, error: "Forbidden: Admin access required" },
        { status: 403 }
      ),
    };
  }

  return { type: "ok", user };
}
```

**Step 4: Run tests to verify they pass**

```bash
node --import tsx --test src/lib/admin-auth.test.ts
```

Expected: All 3 tests PASS.

**Step 5: Commit**

```bash
git add src/lib/admin-auth.ts src/lib/admin-auth.test.ts
git commit -m "feat: add authenticateAdmin guard"
```

---

### Task 4: Update Test Fixtures

**Files:**
- Modify: `src/test/factories.ts`

**Step 1: Add `role` to `createUserFixture`**

```typescript
export function createUserFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "user@example.com",
    passwordHash: "hash",
    name: "Evory User",
    role: "USER",       // <-- add this
    createdAt: FIXTURE_TIMESTAMP,
    updatedAt: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}
```

**Step 2: Add `hiddenAt`/`hiddenById` to forum fixtures**

```typescript
export function createForumPostFixture(overrides: Record<string, unknown> = {}) {
  return {
    // ... existing fields ...
    hiddenAt: null,       // <-- add
    hiddenById: null,     // <-- add
    ...overrides,
  };
}

export function createForumReplyFixture(overrides: Record<string, unknown> = {}) {
  return {
    // ... existing fields ...
    hiddenAt: null,       // <-- add
    hiddenById: null,     // <-- add
    ...overrides,
  };
}
```

**Step 3: Run all tests to verify nothing breaks**

```bash
npm test
```

Expected: All existing tests pass.

**Step 4: Commit**

```bash
git add src/test/factories.ts
git commit -m "feat: add role and hidden fields to test fixtures"
```

---

### Task 5: Admin API — List Posts + Hide Post + Restore Post

**Files:**
- Create: `src/app/api/admin/forum/posts/route.ts`
- Create: `src/app/api/admin/forum/posts/[id]/hide/route.ts`
- Create: `src/app/api/admin/forum/posts/[id]/restore/route.ts`
- Create: `src/app/api/admin/forum/posts/admin-posts.test.ts`

**Step 1: Write the failing tests**

Create `src/app/api/admin/forum/posts/admin-posts.test.ts` covering:
- GET returns posts including hidden ones, with `?status=hidden` filter
- GET returns 401 for unauthenticated, 403 for non-admin
- POST hide sets `hiddenAt` and `hiddenById`, returns updated post
- POST hide returns 404 for missing post, 400 if already hidden
- POST hide creates `CONTENT_HIDDEN` SecurityEvent
- POST restore clears `hiddenAt`/`hiddenById`, returns updated post
- POST restore returns 404 for missing post, 400 if not hidden
- POST restore creates `CONTENT_RESTORED` SecurityEvent
- All mutation routes enforce CSRF (origin header required)

Mock pattern: Same as auth-workflow.test.ts — mock `prismaClient.forumPost`, `prismaClient.securityEvent`, and `prismaClient.userSession`.

**Step 2: Run tests to verify they fail**

```bash
node --import tsx --test src/app/api/admin/forum/posts/admin-posts.test.ts
```

Expected: FAIL — route modules don't exist yet.

**Step 3: Implement GET /api/admin/forum/posts**

Create `src/app/api/admin/forum/posts/route.ts`:

```typescript
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAdmin } from "@/lib/admin-auth";
import { notForAgentsResponse } from "@/lib/agent-api-contract";

export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10) || 20));
    const status = searchParams.get("status"); // "hidden" | null

    const where = status === "hidden" ? { hiddenAt: { not: null } } : {};

    const [posts, total] = await Promise.all([
      prisma.forumPost.findMany({
        where,
        select: {
          id: true, title: true, content: true, category: true,
          viewCount: true, likeCount: true, createdAt: true,
          hiddenAt: true, hiddenById: true,
          agent: { select: { id: true, name: true, type: true, avatarConfig: true } },
          _count: { select: { replies: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.forumPost.count({ where }),
    ]);

    const data = posts.map(({ _count, ...rest }) => ({
      ...rest,
      replyCount: _count.replies,
    }));

    return notForAgentsResponse(Response.json({
      success: true,
      data,
      pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    }));
  } catch (err) {
    console.error("[admin/forum/posts GET]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" }, { status: 500 }
    ));
  }
}
```

**Step 4: Implement POST /api/admin/forum/posts/[id]/hide**

Create `src/app/api/admin/forum/posts/[id]/hide/route.ts`:

```typescript
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateAdmin } from "@/lib/admin-auth";
import { notForAgentsResponse } from "@/lib/agent-api-contract";
import { enforceSameOriginControlPlaneRequest } from "@/lib/request-security";
import { getClientIp } from "@/lib/rate-limit";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const csrfBlocked = await enforceSameOriginControlPlaneRequest({
    request, routeKey: "admin-forum-hide" });
  if (csrfBlocked) return notForAgentsResponse(csrfBlocked);

  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  const { id } = await params;

  try {
    const post = await prisma.forumPost.findUnique({ where: { id } });
    if (!post) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Post not found" }, { status: 404 }));
    }
    if (post.hiddenAt) {
      return notForAgentsResponse(Response.json(
        { success: false, error: "Post is already hidden" }, { status: 400 }));
    }

    const updated = await prisma.forumPost.update({
      where: { id },
      data: { hiddenAt: new Date(), hiddenById: auth.user.id },
    });

    await prisma.securityEvent.create({
      data: {
        type: "CONTENT_HIDDEN",
        routeKey: "admin-forum-hide",
        ipAddress: getClientIp(request),
        userId: auth.user.id,
        metadata: {
          scope: "admin", severity: "warning", operation: "content_hide",
          summary: `Post "${post.title}" hidden by admin.`,
          postId: id,
        },
      },
    });

    return notForAgentsResponse(Response.json({ success: true, data: updated }));
  } catch (err) {
    console.error("[admin/forum/posts/[id]/hide POST]", err);
    return notForAgentsResponse(Response.json(
      { success: false, error: "Internal server error" }, { status: 500 }));
  }
}
```

**Step 5: Implement POST /api/admin/forum/posts/[id]/restore**

Create `src/app/api/admin/forum/posts/[id]/restore/route.ts` — mirror of hide but sets `hiddenAt: null, hiddenById: null` and logs `CONTENT_RESTORED`.

**Step 6: Run tests**

```bash
node --import tsx --test src/app/api/admin/forum/posts/admin-posts.test.ts
```

Expected: All tests PASS.

**Step 7: Commit**

```bash
git add src/app/api/admin/forum/posts/
git commit -m "feat: add admin API for listing, hiding, and restoring forum posts"
```

---

### Task 6: Admin API — Hide/Restore Reply

**Files:**
- Create: `src/app/api/admin/forum/replies/[id]/hide/route.ts`
- Create: `src/app/api/admin/forum/replies/[id]/restore/route.ts`
- Create: `src/app/api/admin/forum/replies/admin-replies.test.ts`

Same pattern as Task 5 but for ForumReply. Mock `prismaClient.forumReply` instead.

**Step 1: Write failing tests** — hide/restore reply, auth guards, CSRF, security events.

**Step 2: Implement hide + restore routes** — same structure as post routes.

**Step 3: Run tests**

```bash
node --import tsx --test src/app/api/admin/forum/replies/admin-replies.test.ts
```

Expected: All tests PASS.

**Step 4: Commit**

```bash
git add src/app/api/admin/forum/replies/
git commit -m "feat: add admin API for hiding and restoring forum replies"
```

---

### Task 7: Query Filtering — Hide Content from Non-Admin Queries

**Files:**
- Modify: `src/app/api/forum/posts/route.ts:26-27` (GET handler, add `hiddenAt: null` to where)
- Modify: `src/app/api/forum/posts/[id]/route.ts:14-39` (GET handler, add `hiddenAt: null` to post query and replies)

**Step 1: Write failing tests**

Add tests to the existing forum test files (or create `src/app/api/forum/posts/forum-hidden-filter.test.ts`):

```typescript
test("GET /api/forum/posts excludes hidden posts", async () => {
  // Mock forumPost.findMany to verify the `where` clause includes hiddenAt: null
  // or mock it to return a hidden post and verify it's excluded
});

test("GET /api/forum/posts/[id] returns 404 for hidden post", async () => {
  // Mock findUnique to return a post with hiddenAt set
  // Verify 404 response
});

test("GET /api/forum/posts/[id] excludes hidden replies", async () => {
  // Mock findUnique with replies containing a hidden reply
  // Verify hidden reply not in response
});
```

**Step 2: Run tests to verify they fail**

```bash
node --import tsx --test src/app/api/forum/posts/forum-hidden-filter.test.ts
```

**Step 3: Update GET /api/forum/posts**

In `src/app/api/forum/posts/route.ts`, update the `where` clause in GET:

```typescript
// Before:
const where = category ? { category } : {};

// After:
const where = {
  hiddenAt: null,
  ...(category ? { category } : {}),
};
```

**Step 4: Update GET /api/forum/posts/[id]**

In `src/app/api/forum/posts/[id]/route.ts`:

```typescript
// Add hiddenAt: null to the findUnique where clause
const post = await prisma.forumPost.findUnique({
  where: { id, hiddenAt: null },
  // ...existing select...
  // In replies select, add where filter:
  replies: {
    where: { hiddenAt: null },
    orderBy: { createdAt: "asc" },
    // ...existing select...
  },
});
```

**Step 5: Run tests**

```bash
node --import tsx --test src/app/api/forum/posts/forum-hidden-filter.test.ts
```

Expected: All tests PASS.

**Step 6: Run full test suite to verify no regressions**

```bash
npm test
```

Expected: All tests pass.

**Step 7: Commit**

```bash
git add src/app/api/forum/posts/
git commit -m "feat: filter hidden posts and replies from non-admin forum queries"
```

**Note:** Agent API routes (`/api/agent/forum/posts`) delegate to the public routes, so the filtering applies automatically.

---

### Task 8: i18n Translations

**Files:**
- Modify: `src/i18n/zh.ts` (add admin keys)
- Modify: `src/i18n/en.ts` (add admin keys)

**Step 1: Add translation keys**

Add to both `zh.ts` and `en.ts`:

```typescript
// admin
"nav.admin": "管理后台" / "Admin",
"admin.title": "内容审核" / "Content Moderation",
"admin.subtitle": "管理论坛帖子和回复" / "Manage forum posts and replies",
"admin.tabAll": "全部帖子" / "All Posts",
"admin.tabHidden": "已隐藏" / "Hidden",
"admin.status.visible": "正常" / "Visible",
"admin.status.hidden": "已隐藏" / "Hidden",
"admin.action.hide": "隐藏" / "Hide",
"admin.action.restore": "恢复" / "Restore",
"admin.action.hiding": "隐藏中..." / "Hiding...",
"admin.action.restoring": "恢复中..." / "Restoring...",
"admin.confirm.hide": "确定要隐藏这个帖子吗？隐藏后所有用户和 Agent 将无法看到。" / "Hide this post? It will be invisible to all users and agents.",
"admin.confirm.restore": "确定要恢复这个帖子吗？" / "Restore this post to be visible again?",
"admin.confirm.hideReply": "确定要隐藏这条回复吗？" / "Hide this reply?",
"admin.confirm.restoreReply": "确定要恢复这条回复吗？" / "Restore this reply?",
"admin.replies": "回复 ({n})" / "Replies ({n})",
"admin.noReplies": "暂无回复" / "No replies",
"admin.empty": "没有找到帖子。" / "No posts found.",
"admin.backToSite": "返回主站" / "Back to site",
"admin.actionSuccess": "操作成功" / "Action completed",
"admin.actionFailed": "操作失败，请稍后重试。" / "Action failed. Please try again.",
"admin.notAdmin": "你没有管理员权限。" / "You do not have admin access.",
```

**Step 2: Verify TypeScript types align**

Since `TranslationKey` is inferred from `zh.ts`, adding keys to `zh.ts` automatically updates the type. `en.ts` must have all matching keys.

**Step 3: Run build to verify no type errors**

```bash
npx tsc --noEmit
```

Expected: No type errors.

**Step 4: Commit**

```bash
git add src/i18n/zh.ts src/i18n/en.ts
git commit -m "feat: add admin i18n translations (zh/en)"
```

---

### Task 9: Sidebar Admin Link

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

**Step 1: Add admin link to sidebar**

The admin link should only show for logged-in admin users. Add state to fetch current user and conditionally render the admin link:

```typescript
// Import Shield icon from lucide-react
import { Shield } from "lucide-react";

// Inside Sidebar component, fetch user auth state:
const [isAdmin, setIsAdmin] = useState(false);

useEffect(() => {
  fetch("/api/auth/me")
    .then((r) => r.json())
    .then((json) => {
      if (json.success && json.data?.role === "ADMIN") {
        setIsAdmin(true);
      }
    })
    .catch(() => {});
}, []);

// In the Control Plane section, conditionally add admin link:
{isAdmin && (
  <Link href="/admin" className={/* same style as other utility items */}>
    <Shield className="h-4 w-4 ..." />
    {t("nav.admin")}
  </Link>
)}
```

**Step 2: Commit**

```bash
git add src/components/layout/sidebar.tsx
git commit -m "feat: show admin link in sidebar for admin users"
```

---

### Task 10: Admin UI Page

**Files:**
- Create: `src/app/admin/page.tsx`

**Step 1: Implement the admin page**

Create `src/app/admin/page.tsx` as a `"use client"` component following existing page patterns:

**Structure:**
1. `useEffect` to fetch `/api/auth/me` — if not admin, redirect to `/`
2. `useEffect` to fetch `/api/admin/forum/posts?status=<tab>` with pagination
3. Tab state: `"all"` | `"hidden"`
4. Expandable post rows — click title to show content + replies
5. Hide/Restore buttons with confirmation dialog (native `confirm()`)
6. Toast-style error/success display (inline banner, same pattern as settings page)
7. Pagination controls (same pattern as forum page)

**Key UI patterns to follow:**
- Use `Card` component for the main content area
- Use `Badge` for status indicators (variant: `"success"` for visible, `"danger"` for hidden)
- Use `Button` for actions (variant: `"danger"` for hide, `"secondary"` for restore)
- Use `PageHeader` for the page title
- Use `useT()` for all user-facing text
- Fetch replies on expand: `GET /api/admin/forum/posts` returns posts, then expand loads detail with replies inline

**Data fetching:**
```typescript
const fetchPosts = useCallback(async () => {
  setLoading(true);
  const params = new URLSearchParams({
    page: String(page),
    pageSize: "20",
    ...(tab === "hidden" ? { status: "hidden" } : {}),
  });
  const res = await fetch(`/api/admin/forum/posts?${params}`);
  const json = await res.json();
  if (json.success) {
    setPosts(json.data);
    setPagination(json.pagination);
  }
  setLoading(false);
}, [page, tab]);
```

**Hide/Restore actions:**
```typescript
async function handleHidePost(postId: string) {
  if (!confirm(t("admin.confirm.hide"))) return;
  setBusyId(postId);
  const res = await fetch(`/api/admin/forum/posts/${postId}/hide`, {
    method: "POST",
  });
  const json = await res.json();
  setBusyId(null);
  if (json.success) { fetchPosts(); }
  else { setError(json.error); }
}
```

**Step 2: Commit**

```bash
git add src/app/admin/
git commit -m "feat: add admin content moderation page"
```

---

### Task 11: Final Integration Test + Verification

**Step 1: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

**Step 2: Run build**

```bash
npm run build
```

Expected: Build succeeds with no errors.

**Step 3: Manual smoke test**

```bash
npm run dev
```

- Visit `/admin` as non-admin → redirected to `/`
- Set a user to ADMIN in DB: `UPDATE "User" SET role='ADMIN' WHERE email='your@email.com'`
- Visit `/admin` as admin → see content moderation panel
- Create a test post via API, verify it appears in admin list
- Hide the post, verify it disappears from `/forum` and from Agent API
- Restore the post, verify it reappears
- Check SecurityEvent table for CONTENT_HIDDEN/CONTENT_RESTORED entries

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: admin content moderation - complete implementation"
```

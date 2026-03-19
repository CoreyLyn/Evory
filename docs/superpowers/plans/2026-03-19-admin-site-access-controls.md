# Admin Site Access Controls Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-controlled switches that can disable user registration and close all public content browsing while keeping login and admin management available.

**Architecture:** Persist a singleton `SiteConfig` model in Prisma, read it through one shared helper, and apply centralized guards at admin APIs, signup flow, public read APIs, and public page entrypoints. Close the public API layer before page shells so browser users and official Agents both see the same enforced access boundary.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma, Node test runner, existing admin auth/rate-limit/request-security helpers

---

## File Structure

### New files

- `src/lib/site-config.ts`
  Loads the singleton site configuration, returns default-open values when unset, and exposes helper guards for registration and public-content access.
- `src/lib/site-config.test.ts`
  Covers default fallback behavior and singleton read/update helpers.
- `src/app/api/admin/site-config/route.ts`
  Admin-only read/write API for the new site configuration switches.
- `src/app/api/admin/site-config/route.test.ts`
  Covers admin auth, read/write success, and validation behavior.
- `src/components/ui/site-access-closed-state.tsx`
  Shared page-shell component for rendering a consistent "registration closed" or "public content unavailable" state.
- `src/app/signup/page.test.tsx`
  Covers the signup page closed-state rendering when registration is disabled.
- `src/app/api/auth/signup/route.test.ts`
  Covers signup rejection when registration is disabled.
- `prisma/migrations/20260319_add_site_config/migration.sql`
  Adds the `SiteConfig` table.

### Existing files to modify

- `prisma/schema.prisma`
  Add the `SiteConfig` model.
- `src/app/admin/page.tsx`
  Add an admin settings section with the two new switches wired to the admin site-config API.
- `src/app/api/auth/signup/route.ts`
  Enforce the registration-enabled guard before creating users.
- `src/app/signup/page.tsx`
  Render the closed-state component instead of the form when registration is disabled.
- `src/app/forum/page.tsx`
  Enforce public-content closure at the forum list page entrypoint.
- `src/app/forum/[id]/page.tsx`
  Enforce public-content closure at the forum detail page entrypoint.
- `src/app/tasks/page.tsx`
  Enforce public-content closure at the task list page entrypoint.
- `src/app/tasks/[id]/page.tsx`
  Enforce public-content closure at the task detail page entrypoint.
- `src/app/knowledge/page.tsx`
  Enforce public-content closure at the knowledge landing page entrypoint.
- `src/app/knowledge/[...slug]/page.tsx`
  Enforce public-content closure at the knowledge detail page entrypoint.
- `src/app/agents/page.tsx`
  Enforce public-content closure at the public agents list page entrypoint.
- `src/app/agents/[id]/page.tsx`
  Enforce public-content closure at the public agent detail page entrypoint.
- `src/app/api/forum/posts/route.ts`
  Guard public forum list reads before serving data.
- `src/app/api/forum/posts/[id]/route.ts`
  Guard public forum detail reads before serving data.
- `src/app/api/tasks/route.ts`
  Guard public task list reads before serving data.
- `src/app/api/tasks/[id]/route.ts`
  Guard public task detail reads before serving data.
- `src/app/api/knowledge/tree/route.ts`
  Guard public knowledge tree reads before serving data.
- `src/app/api/knowledge/documents/route.ts`
  Guard public knowledge landing-document reads before serving data.
- `src/app/api/knowledge/documents/[...slug]/route.ts`
  Guard public knowledge document reads before serving data.
- `src/app/api/knowledge/search/route.ts`
  Guard public knowledge search reads before serving data.
- `src/app/api/agents/list/route.ts`
  Guard public agent-directory reads before serving data.
- `src/app/api/agents/[id]/route.ts`
  Guard public agent-detail reads before serving data.
- `src/app/api/agent/forum/posts/route.ts`
  Add focused coverage proving the official Agent forum-read path closes via the shared public guard.
- `src/app/api/agent/forum/posts/[id]/route.ts`
  Add focused coverage proving the official Agent forum-detail path closes via the shared public guard.
- `src/app/api/agent/tasks/route.ts`
  Add focused coverage proving the official Agent tasks-read path closes via the shared public guard.
- `src/app/api/agent/tasks/[id]/route.ts`
  Add focused coverage proving the official Agent task-detail path closes via the shared public guard.
- `src/app/api/agent/knowledge/tree/route.ts`
  Add focused coverage proving the official Agent knowledge-tree path closes via the shared public guard.
- `src/app/api/agent/knowledge/documents/route.ts`
  Add focused coverage proving the official Agent knowledge-document path closes via the shared public guard.
- `src/app/api/agent/knowledge/documents/[...slug]/route.ts`
  Add focused coverage proving the official Agent knowledge-detail path closes via the shared public guard.
- `src/app/api/agent/knowledge/search/route.ts`
  Add focused coverage proving the official Agent knowledge-search path closes via the shared public guard.

### Existing test files likely to extend

- `src/app/api/knowledge/knowledge-guards.test.ts`
- `src/app/api/tasks/task-guards.test.ts`
- `src/app/api/agents/public-agent-visibility.test.ts`
- `src/app/api/agent/agent-read-api.test.ts`
- `src/app/read-only-page-shells.test.tsx`
- `src/app/knowledge/page.test.tsx`
- `src/app/knowledge/[...slug]/page.test.tsx`
- `src/app/agents/page.test.tsx`
- `src/app/agents/[id]/page.test.tsx`

## Task 1: Add Persistent Site Configuration And Shared Guards

**Files:**
- Create: `src/lib/site-config.ts`
- Test: `src/lib/site-config.test.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260319_add_site_config/migration.sql`

- [ ] **Step 1: Write the failing site-config helper tests**

```ts
test("getSiteConfig returns default-open values when no row exists", async () => {
  const prisma = {
    siteConfig: {
      findFirst: async () => null,
    },
  } as const;

  const config = await getSiteConfig(prisma as never);

  assert.deepEqual(config, {
    registrationEnabled: true,
    publicContentEnabled: true,
  });
});

test("upsertSiteConfig persists booleans on the singleton row", async () => {
  let saved: Record<string, unknown> | null = null;
  const prisma = {
    siteConfig: {
      upsert: async ({ create, update }: { create: unknown; update: unknown }) => {
        saved = { create, update };
        return {
          id: "site-config",
          registrationEnabled: false,
          publicContentEnabled: false,
        };
      },
    },
  } as const;

  const config = await upsertSiteConfig(prisma as never, {
    registrationEnabled: false,
    publicContentEnabled: false,
  });

  assert.equal(config.registrationEnabled, false);
  assert.equal(config.publicContentEnabled, false);
  assert.ok(saved);
});
```

- [ ] **Step 2: Run the helper test to verify it fails**

Run: `npm test -- src/lib/site-config.test.ts`
Expected: FAIL because `src/lib/site-config.ts` does not exist yet.

- [ ] **Step 3: Add the Prisma model and minimal helper implementation**

```prisma
model SiteConfig {
  id                   String   @id @default(cuid())
  registrationEnabled  Boolean  @default(true)
  publicContentEnabled Boolean  @default(true)
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
}
```

```ts
export const DEFAULT_SITE_CONFIG = {
  registrationEnabled: true,
  publicContentEnabled: true,
} as const;

export async function getSiteConfig(prismaClient = prisma) {
  const row = await prismaClient.siteConfig.findFirst();

  return row ?? DEFAULT_SITE_CONFIG;
}

export async function upsertSiteConfig(
  prismaClient = prisma,
  input: { registrationEnabled: boolean; publicContentEnabled: boolean }
) {
  const existing = await prismaClient.siteConfig.findFirst({
    select: { id: true },
  });

  return prismaClient.siteConfig.upsert({
    where: { id: existing?.id ?? "site-config-singleton" },
    create: {
      id: existing?.id ?? "site-config-singleton",
      ...input,
    },
    update: input,
  });
}
```

- [ ] **Step 4: Add route-friendly guard helpers**

```ts
export async function requireRegistrationEnabled() {
  const config = await getSiteConfig();
  if (config.registrationEnabled) return null;

  return Response.json(
    { success: false, error: "Registration is currently closed", code: "REGISTRATION_DISABLED" },
    { status: 403 }
  );
}

export async function requirePublicContentEnabled() {
  const config = await getSiteConfig();
  if (config.publicContentEnabled) return null;

  return Response.json(
    { success: false, error: "Public content is currently unavailable", code: "PUBLIC_CONTENT_DISABLED" },
    { status: 403 }
  );
}
```

- [ ] **Step 5: Run the helper test to verify it passes**

Run: `npm test -- src/lib/site-config.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260319_add_site_config/migration.sql src/lib/site-config.ts src/lib/site-config.test.ts
git commit -m "feat: add site access configuration"
```

## Task 2: Add Admin APIs And Admin UI Controls

**Files:**
- Create: `src/app/api/admin/site-config/route.ts`
- Test: `src/app/api/admin/site-config/route.test.ts`
- Modify: `src/app/admin/page.tsx`
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`

- [ ] **Step 1: Write the failing admin route tests**

```ts
test("GET /api/admin/site-config returns the current site config for admins", async () => {
  const request = new NextRequest("http://localhost/api/admin/site-config");
  const response = await GET(request);
  assert.equal(response.status, 200);
});

test("PUT /api/admin/site-config rejects non-admins", async () => {
  const request = new NextRequest("http://localhost/api/admin/site-config", {
    method: "PUT",
    body: JSON.stringify({ registrationEnabled: false, publicContentEnabled: false }),
  });
  const response = await PUT(request);
  assert.equal(response.status, 403);
});
```

- [ ] **Step 2: Run the admin route test to verify it fails**

Run: `npm test -- src/app/api/admin/site-config/route.test.ts`
Expected: FAIL because the route does not exist yet.

- [ ] **Step 3: Implement the admin API using existing admin protections**

```ts
export async function GET(request: NextRequest) {
  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  return notForAgentsResponse(Response.json({
    success: true,
    data: await getSiteConfig(),
  }));
}

export async function PUT(request: NextRequest) {
  const csrfBlocked = await enforceSameOriginControlPlaneRequest({
    request,
    routeKey: "admin-site-config",
  });
  if (csrfBlocked) return notForAgentsResponse(csrfBlocked);

  const auth = await authenticateAdmin(request);
  if (auth.type === "error") return notForAgentsResponse(auth.response);

  const rateLimited = await enforceRateLimit({
    request,
    bucketId: "admin-site-config",
    routeKey: "admin-site-config",
    maxRequests: 20,
    windowMs: 10 * 60 * 1000,
    subjectId: auth.user.id,
  });
  if (rateLimited) return notForAgentsResponse(rateLimited);

  const body = await request.json();

  return notForAgentsResponse(Response.json({
    success: true,
    data: await upsertSiteConfig(prisma, {
      registrationEnabled: Boolean(body.registrationEnabled),
      publicContentEnabled: Boolean(body.publicContentEnabled),
    }),
  }));
}
```

- [ ] **Step 4: Add the admin page controls**

```tsx
<Card>
  <div className="space-y-4">
    <h2>{t("admin.siteControls.title")}</h2>
    <button
      role="switch"
      aria-checked={siteConfig.registrationEnabled}
      onClick={() => void saveSiteConfig({ registrationEnabled: !siteConfig.registrationEnabled })}
    >
      {t("admin.siteControls.registration")}
    </button>
    <button
      role="switch"
      aria-checked={siteConfig.publicContentEnabled}
      onClick={() => void saveSiteConfig({ publicContentEnabled: !siteConfig.publicContentEnabled })}
    >
      {t("admin.siteControls.publicContent")}
    </button>
  </div>
</Card>
```

- [ ] **Step 5: Run the admin route test to verify it passes**

Run: `npm test -- src/app/api/admin/site-config/route.test.ts`
Expected: PASS

- [ ] **Step 6: Run the touched admin UI tests**

Run: `npm test -- src/app/admin`
Expected: PASS if there are existing page-level admin tests, otherwise no matching tests and move to the next targeted suite.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/admin/site-config/route.ts src/app/api/admin/site-config/route.test.ts src/app/admin/page.tsx src/i18n/zh.ts src/i18n/en.ts
git commit -m "feat: add admin site access controls"
```

## Task 3: Close Registration At Page And API Boundaries

**Files:**
- Create: `src/app/signup/page.test.tsx`
- Create: `src/app/api/auth/signup/route.test.ts`
- Create: `src/components/ui/site-access-closed-state.tsx`
- Modify: `src/app/signup/page.tsx`
- Modify: `src/app/api/auth/signup/route.ts`

- [ ] **Step 1: Write the failing signup API and page tests**

```ts
test("POST /api/auth/signup returns 403 when registration is disabled", async () => {
  const request = new NextRequest("http://localhost/api/auth/signup", {
    method: "POST",
    body: JSON.stringify({
      email: "owner@example.com",
      password: "password123",
      name: "Owner",
    }),
  });

  const response = await POST(request);
  assert.equal(response.status, 403);
});
```

```tsx
test("signup page renders the closed state instead of the form", async () => {
  const page = await SignupPage();
  const html = renderToStaticMarkup(page);

  assert.match(html, /当前已关闭注册/);
  assert.doesNotMatch(html, /注册并进入我的 Agents/);
});
```

- [ ] **Step 2: Run the signup tests to verify they fail**

Run: `npm test -- src/app/api/auth/signup/route.test.ts src/app/signup/page.test.tsx`
Expected: FAIL because the new guard is not wired in yet.

- [ ] **Step 3: Implement the shared closed-state page component**

```tsx
export function SiteAccessClosedState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card className="mx-auto max-w-3xl text-center">
      <h1 className="font-display text-3xl font-bold">{title}</h1>
      <p className="mt-3 text-sm text-muted">{description}</p>
      <Link href="/login" className="mt-6 inline-flex">
        返回登录
      </Link>
    </Card>
  );
}
```

- [ ] **Step 4: Guard the signup API before any validation or writes**

```ts
const registrationBlocked = await requireRegistrationEnabled();
if (registrationBlocked) {
  return registrationBlocked;
}
```

- [ ] **Step 5: Guard the signup page before rendering the form**

```tsx
const config = await getSiteConfig();

if (!config.registrationEnabled) {
  return (
    <SiteAccessClosedState
      title="当前已关闭注册"
      description="请联系管理员获取开放时间。已有账号仍可继续登录。"
    />
  );
}
```

- [ ] **Step 6: Run the signup tests to verify they pass**

Run: `npm test -- src/app/api/auth/signup/route.test.ts src/app/signup/page.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/site-access-closed-state.tsx src/app/signup/page.tsx src/app/signup/page.test.tsx src/app/api/auth/signup/route.ts src/app/api/auth/signup/route.test.ts
git commit -m "feat: close registration from site config"
```

## Task 4: Close Public Read APIs First

**Files:**
- Modify: `src/app/api/forum/posts/route.ts`
- Modify: `src/app/api/forum/posts/[id]/route.ts`
- Modify: `src/app/api/tasks/route.ts`
- Modify: `src/app/api/tasks/[id]/route.ts`
- Modify: `src/app/api/knowledge/tree/route.ts`
- Modify: `src/app/api/knowledge/documents/route.ts`
- Modify: `src/app/api/knowledge/documents/[...slug]/route.ts`
- Modify: `src/app/api/knowledge/search/route.ts`
- Modify: `src/app/api/agents/list/route.ts`
- Modify: `src/app/api/agents/[id]/route.ts`
- Modify: `src/app/api/forum/forum-workflow.test.ts`
- Modify: `src/app/api/tasks/task-guards.test.ts`
- Modify: `src/app/api/knowledge/knowledge-guards.test.ts`
- Modify: `src/app/api/agents/public-agent-visibility.test.ts`

- [ ] **Step 1: Add failing public-read guard tests**

```ts
test("public forum list GET returns 403 when public content is disabled", async () => {
  const request = new NextRequest("http://localhost/api/forum/posts");
  const response = await GET(request);
  assert.equal(response.status, 403);
});

test("public tasks GET returns 403 when public content is disabled", async () => {
  const request = new NextRequest("http://localhost/api/tasks");
  const response = await GET(request);
  assert.equal(response.status, 403);
});
```

- [ ] **Step 2: Run the targeted public-read tests to verify they fail**

Run: `npm test -- src/app/api/forum/forum-workflow.test.ts src/app/api/tasks/task-guards.test.ts src/app/api/knowledge/knowledge-guards.test.ts src/app/api/agents/public-agent-visibility.test.ts`
Expected: FAIL because the public GET handlers still serve data.

- [ ] **Step 3: Add the guard at the top of each public GET handler**

```ts
const publicContentBlocked = await requirePublicContentEnabled();
if (publicContentBlocked) {
  return notForAgentsResponse(publicContentBlocked);
}
```

- [ ] **Step 4: Keep write behavior unchanged**

Do not add the public-content guard to:

- public POST handlers for forum or tasks
- official Agent write routes

The phase requirement is public browsing closure, not full execution shutdown.

- [ ] **Step 5: Run the targeted public-read tests to verify they pass**

Run: `npm test -- src/app/api/forum/forum-workflow.test.ts src/app/api/tasks/task-guards.test.ts src/app/api/knowledge/knowledge-guards.test.ts src/app/api/agents/public-agent-visibility.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/api/forum/posts/route.ts src/app/api/forum/posts/[id]/route.ts src/app/api/tasks/route.ts src/app/api/tasks/[id]/route.ts src/app/api/knowledge/tree/route.ts src/app/api/knowledge/documents/route.ts src/app/api/knowledge/documents/[...slug]/route.ts src/app/api/knowledge/search/route.ts src/app/api/agents/list/route.ts src/app/api/agents/[id]/route.ts src/app/api/forum/forum-workflow.test.ts src/app/api/tasks/task-guards.test.ts src/app/api/knowledge/knowledge-guards.test.ts src/app/api/agents/public-agent-visibility.test.ts
git commit -m "feat: close public content read APIs"
```

## Task 5: Close Public Page Entry Points

**Files:**
- Modify: `src/app/forum/page.tsx`
- Modify: `src/app/forum/[id]/page.tsx`
- Modify: `src/app/tasks/page.tsx`
- Modify: `src/app/tasks/[id]/page.tsx`
- Modify: `src/app/knowledge/page.tsx`
- Modify: `src/app/knowledge/[...slug]/page.tsx`
- Modify: `src/app/agents/page.tsx`
- Modify: `src/app/agents/[id]/page.tsx`
- Modify: `src/app/read-only-page-shells.test.tsx`
- Modify: `src/app/knowledge/page.test.tsx`
- Modify: `src/app/knowledge/[...slug]/page.test.tsx`
- Modify: `src/app/agents/page.test.tsx`
- Modify: `src/app/agents/[id]/page.test.tsx`

- [ ] **Step 1: Add failing page-shell tests**

```tsx
test("forum page renders the closed state when public content is disabled", async () => {
  const html = renderToStaticMarkup(await ForumPage({ searchParams: Promise.resolve({}) }));
  assert.match(html, /公开内容暂不可用/);
});

test("agents page renders the closed state when public content is disabled", async () => {
  const html = renderToStaticMarkup(<AgentsPage />);
  assert.match(html, /公开内容暂不可用/);
});
```

- [ ] **Step 2: Run the page-shell tests to verify they fail**

Run: `npm test -- src/app/read-only-page-shells.test.tsx src/app/knowledge/page.test.tsx src/app/knowledge/[...slug]/page.test.tsx src/app/agents/page.test.tsx src/app/agents/[id]/page.test.tsx`
Expected: FAIL because the pages still render content.

- [ ] **Step 3: Short-circuit each public page entrypoint with the shared closed-state component**

```tsx
const config = await getSiteConfig();

if (!config.publicContentEnabled) {
  return (
    <SiteAccessClosedState
      title="公开内容暂不可用"
      description="论坛、任务、知识库和 Agent 展示页已由管理员临时关闭。"
    />
  );
}
```

- [ ] **Step 4: Preserve login and admin navigation**

Do not add the public-content guard to:

- `src/app/login/page.tsx`
- `src/app/admin/page.tsx`
- admin knowledge pages
- user control-plane pages under `src/app/settings`

- [ ] **Step 5: Run the page-shell tests to verify they pass**

Run: `npm test -- src/app/read-only-page-shells.test.tsx src/app/knowledge/page.test.tsx src/app/knowledge/[...slug]/page.test.tsx src/app/agents/page.test.tsx src/app/agents/[id]/page.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/forum/page.tsx src/app/forum/[id]/page.tsx src/app/tasks/page.tsx src/app/tasks/[id]/page.tsx src/app/knowledge/page.tsx src/app/knowledge/[...slug]/page.tsx src/app/agents/page.tsx src/app/agents/[id]/page.tsx src/app/read-only-page-shells.test.tsx src/app/knowledge/page.test.tsx src/app/knowledge/[...slug]/page.test.tsx src/app/agents/page.test.tsx src/app/agents/[id]/page.test.tsx
git commit -m "feat: close public content pages"
```

## Task 6: Verify Official Agent Read Routes Close Through Shared Guards

**Files:**
- Modify: `src/app/api/agent/agent-read-api.test.ts`
- Modify: `src/app/api/agent/forum/posts/route.ts`
- Modify: `src/app/api/agent/forum/posts/[id]/route.ts`
- Modify: `src/app/api/agent/tasks/route.ts`
- Modify: `src/app/api/agent/tasks/[id]/route.ts`
- Modify: `src/app/api/agent/knowledge/tree/route.ts`
- Modify: `src/app/api/agent/knowledge/documents/route.ts`
- Modify: `src/app/api/agent/knowledge/documents/[...slug]/route.ts`
- Modify: `src/app/api/agent/knowledge/search/route.ts`

- [ ] **Step 1: Add failing official Agent read-path tests**

```ts
test("official Agent forum list GET returns 403 when public content is disabled", async () => {
  const request = new NextRequest("http://localhost/api/agent/forum/posts", {
    headers: { authorization: "Bearer test-key" },
  });

  const response = await GET(request);
  assert.equal(response.status, 403);
});
```

- [ ] **Step 2: Run the Agent read-route tests to verify they fail**

Run: `npm test -- src/app/api/agent/agent-read-api.test.ts`
Expected: FAIL if any official Agent read route still bypasses the public GET guard.

- [ ] **Step 3: Wire any remaining detail/document/search route gaps back through the guarded public handlers**

```ts
const response = await getPublicKnowledgeSearch(request);
return officialAgentResponse(response);
```

The goal is not new logic. The goal is consistent reuse of already-guarded public GET handlers.

- [ ] **Step 4: Run the Agent read-route tests to verify they pass**

Run: `npm test -- src/app/api/agent/agent-read-api.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/api/agent/agent-read-api.test.ts src/app/api/agent/forum/posts/route.ts src/app/api/agent/forum/posts/[id]/route.ts src/app/api/agent/tasks/route.ts src/app/api/agent/tasks/[id]/route.ts src/app/api/agent/knowledge/tree/route.ts src/app/api/agent/knowledge/documents/route.ts src/app/api/agent/knowledge/documents/[...slug]/route.ts src/app/api/agent/knowledge/search/route.ts
git commit -m "test: verify agent read routes respect site access controls"
```

## Final Verification Checklist

- [ ] `SiteConfig` migration applies cleanly
- [ ] Admin can read and update both switches
- [ ] Signup page and signup API both close when registration is disabled
- [ ] Public page entrypoints all render the closed state when public content is disabled
- [ ] Public read APIs all return `403` with a stable closed-state error payload
- [ ] Official Agent read APIs also return `403` through the same public-content guard
- [ ] Login and admin access still work
- [ ] `npm test` passes

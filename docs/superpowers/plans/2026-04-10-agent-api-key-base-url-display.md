# Agent API Key Base URL Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two admin-configurable global Base URL fields to the API Key admin area and show them on the user Agents API Key card only after the API key has been fulfilled.

**Architecture:** Extend the singleton `SiteConfig` model with two optional Base URL fields, keep persistence in the existing site-config path, add a user-readable route that exposes only these display fields, then thread the values into the Agents page card. Put the admin editing UI in the existing admin `shop` tab so the operator changes the values from the API Key area without coupling them to individual keys or products.

**Tech Stack:** Next.js App Router, React, Prisma, Node test runner, existing admin/site-config helpers

---

### Task 1: Extend Site Config Persistence

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/site-config.ts`
- Test: `src/lib/site-config.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
test("getSiteConfig returns null base urls when no row exists", async () => {
  const config = await getSiteConfig({
    siteConfig: {
      findFirst: async () => null,
    },
  } as never);

  assert.equal(config.openAiBaseUrl, null);
  assert.equal(config.anthropicBaseUrl, null);
});

test("upsertSiteConfig persists optional base urls on the singleton row", async () => {
  const config = await upsertSiteConfig({
    siteConfig: {
      findFirst: async () => null,
      upsert: async ({ create, update, where }: any) => ({
        id: "site-config-singleton",
        ...create,
        ...update,
        where,
      }),
    },
  } as never, {
    registrationEnabled: false,
    publicContentEnabled: false,
    openAiBaseUrl: "https://openai.example/v1",
    anthropicBaseUrl: null,
  });

  assert.equal(config.openAiBaseUrl, "https://openai.example/v1");
  assert.equal(config.anthropicBaseUrl, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/site-config.test.ts`
Expected: FAIL because `openAiBaseUrl` and `anthropicBaseUrl` do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export const DEFAULT_SITE_CONFIG = {
  registrationEnabled: true,
  publicContentEnabled: true,
  openAiBaseUrl: null,
  anthropicBaseUrl: null,
} as const;
```

```prisma
model SiteConfig {
  id                   String   @id @default(cuid())
  registrationEnabled  Boolean  @default(true)
  publicContentEnabled Boolean  @default(true)
  openAiBaseUrl        String?
  anthropicBaseUrl     String?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/site-config.test.ts`
Expected: PASS with the new fields present in defaults and upsert payloads.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma src/lib/site-config.ts src/lib/site-config.test.ts
git commit -m "feat: extend site config with api base urls"
```

### Task 2: Update Admin and User Config Routes

**Files:**
- Modify: `src/app/api/admin/site-config/route.ts`
- Create: `src/app/api/site-config/base-urls/route.ts`
- Test: `src/app/api/admin/site-config/route.test.ts`
- Test: `src/app/api/site-config/base-urls/route.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
test("PUT /api/admin/site-config trims base urls and stores null for blanks", async () => {
  // send openAiBaseUrl with whitespace and anthropicBaseUrl as blank string
  // expect saved update payload to contain trimmed URL and null
});

test("GET /api/site-config/base-urls returns only the public base url fields", async () => {
  // mock getSiteConfig result and assert the new route only returns the two URLs
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/admin/site-config/route.test.ts src/app/api/site-config/base-urls/route.test.ts`
Expected: FAIL because the admin route does not accept the fields and the public route does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
function normalizeOptionalBaseUrl(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error("invalid");
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
```

```ts
export async function GET() {
  const config = await getSiteConfig();
  return Response.json({
    success: true,
    data: {
      openAiBaseUrl: config.openAiBaseUrl,
      anthropicBaseUrl: config.anthropicBaseUrl,
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/api/admin/site-config/route.test.ts src/app/api/site-config/base-urls/route.test.ts`
Expected: PASS with normalized values and the new public route.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/admin/site-config/route.ts src/app/api/admin/site-config/route.test.ts src/app/api/site-config/base-urls/route.ts src/app/api/site-config/base-urls/route.test.ts
git commit -m "feat: expose configurable api base urls"
```

### Task 3: Add Admin API Key Area Controls

**Files:**
- Modify: `src/app/admin/page.tsx`
- Test: `src/app/admin/page.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
test("admin shop tab renders base url config inputs in the api key area", () => {
  // render admin page helpers or extracted component and assert both labels exist
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/admin/page.test.tsx`
Expected: FAIL because the API Key area has no Base URL config UI yet.

- [ ] **Step 3: Write minimal implementation**

```tsx
<Card>
  <h3>Base URL</h3>
  <input value={siteConfigDraft.openAiBaseUrl} />
  <input value={siteConfigDraft.anthropicBaseUrl} />
  <Button>保存 Base URL</Button>
</Card>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/admin/page.test.tsx`
Expected: PASS with both labels rendered from the `shop` tab UI.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/page.tsx src/app/admin/page.test.tsx
git commit -m "feat: add api base url controls to admin api key area"
```

### Task 4: Show Base URLs on the User Agents API Key Card

**Files:**
- Modify: `src/app/settings/agents/page.tsx`
- Modify: `src/lib/shop-client.ts`
- Test: `src/app/settings/agents/page.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
test("UserProvidedApiKeyCard renders both base urls when fulfilled", () => {
  // fulfilled summary + two URLs => both labels and copy buttons render
});

test("UserProvidedApiKeyCard hides base url section when not fulfilled", () => {
  // pending summary + URL values => section stays hidden
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/settings/agents/page.test.tsx`
Expected: FAIL because the card has no Base URL props or rendering.

- [ ] **Step 3: Write minimal implementation**

```ts
type UserApiBaseUrls = {
  openAiBaseUrl: string | null;
  anthropicBaseUrl: string | null;
};
```

```tsx
{summary.status === "FULFILLED" && hasBaseUrls ? (
  <div>
    <p>Base URL</p>
    {baseUrls.openAiBaseUrl ? <CopyableCodeBlock value={baseUrls.openAiBaseUrl} /> : null}
    {baseUrls.anthropicBaseUrl ? <CopyableCodeBlock value={baseUrls.anthropicBaseUrl} /> : null}
  </div>
) : null}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/settings/agents/page.test.tsx`
Expected: PASS with the section only visible for fulfilled summaries.

- [ ] **Step 5: Commit**

```bash
git add src/app/settings/agents/page.tsx src/app/settings/agents/page.test.tsx src/lib/shop-client.ts
git commit -m "feat: show fulfilled api key base urls on agents page"
```

### Task 5: Final Verification

**Files:**
- Verify only

- [ ] **Step 1: Run focused tests**

Run: `npm test -- src/lib/site-config.test.ts src/app/api/admin/site-config/route.test.ts src/app/api/site-config/base-urls/route.test.ts src/app/settings/agents/page.test.tsx`
Expected: PASS with 0 failures.

- [ ] **Step 2: Run broader regression checks**

Run: `npm test -- src/app/admin/page.test.tsx src/app/admin/admin-tabs.test.tsx`
Expected: PASS to confirm the admin area still renders and tab behavior is intact.

- [ ] **Step 3: Review diff**

Run: `git diff -- prisma/schema.prisma src/lib/site-config.ts src/app/api/admin/site-config/route.ts src/app/api/site-config/base-urls/route.ts src/app/admin/page.tsx src/app/settings/agents/page.tsx`
Expected: Only the planned Base URL changes appear.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-04-10-agent-api-key-base-url-display.md
git commit -m "docs: add api key base url display plan"
```

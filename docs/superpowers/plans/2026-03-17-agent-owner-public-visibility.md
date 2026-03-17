# Agent Owner Public Visibility Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an owner-controlled public owner display for each Agent so the owner can opt in on `/settings/agents` and the chosen owner label appears on both `/agents` and `/agents/[id]`.

**Architecture:** Add a per-Agent boolean flag in Prisma, centralize public owner shaping and email masking in one shared helper, then thread the new optional owner payload through public routes, owner-management routes, and UI rendering. Keep public pages silent when owner display is disabled, and reuse the existing authenticated `PATCH /api/users/me/agents/[id]` route for updates.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 7, TypeScript 5, Node.js native test runner

---

## File Map

- Modify: `prisma/schema.prisma`
- Modify: `src/test/factories.ts`
- Create: `src/lib/agent-public-owner.ts`
- Create: `src/lib/agent-public-owner.test.ts`
- Modify: `src/app/api/agents/list/route.ts`
- Modify: `src/app/api/agents/[id]/route.ts`
- Modify: `src/app/api/agents/public-agent-visibility.test.ts`
- Modify: `src/app/api/agents/agent-detail.test.ts`
- Modify: `src/app/api/users/me/agents/route.ts`
- Modify: `src/app/api/users/me/agents/[id]/route.ts`
- Modify: `src/app/api/users/me/agents/[id]/route.test.ts`
- Modify: `src/app/agents/page.tsx`
- Modify: `src/app/agents/page.test.tsx`
- Modify: `src/app/agents/[id]/page.tsx`
- Modify: `src/app/agents/[id]/page.test.tsx`
- Modify: `src/app/settings/agents/page.tsx`
- Modify: `src/app/settings/agents/page.test.tsx`
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`

## Chunk 1: Persistence And Shared Owner Presenter

### Task 1: Add the per-Agent public owner flag and helper

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `src/test/factories.ts`
- Create: `src/lib/agent-public-owner.ts`
- Create: `src/lib/agent-public-owner.test.ts`

- [ ] **Step 1: Write the failing helper tests**

Create `src/lib/agent-public-owner.test.ts` with focused tests for:

```typescript
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPublicOwner,
  maskOwnerEmail,
} from "./agent-public-owner";

test("buildPublicOwner returns owner display name when enabled and name is present", () => {
  assert.deepEqual(
    buildPublicOwner({
      showOwnerInPublic: true,
      owner: { id: "user-1", name: "Corey", email: "corey@example.com" },
    }),
    { id: "user-1", displayName: "Corey" }
  );
});

test("buildPublicOwner masks email when name is missing", () => {
  assert.deepEqual(
    buildPublicOwner({
      showOwnerInPublic: true,
      owner: { id: "user-1", name: "", email: "corey@example.com" },
    }),
    { id: "user-1", displayName: "cor***@example.com" }
  );
});

test("buildPublicOwner returns null when public display is disabled", () => {
  assert.equal(
    buildPublicOwner({
      showOwnerInPublic: false,
      owner: { id: "user-1", name: "Corey", email: "corey@example.com" },
    }),
    null
  );
});

test("maskOwnerEmail keeps domain and masks most of the local part", () => {
  assert.equal(maskOwnerEmail("ab@example.com"), "a***@example.com");
});
```

- [ ] **Step 2: Run the helper test to verify it fails**

Run: `node --import tsx --test src/lib/agent-public-owner.test.ts`
Expected: FAIL with module not found or missing export errors for `agent-public-owner.ts`

- [ ] **Step 3: Add the Prisma field**

In `prisma/schema.prisma`, update `model Agent` to include:

```prisma
showOwnerInPublic Boolean @default(false)
```

Place it next to the existing ownership and claim fields so ownership-related state stays grouped.

- [ ] **Step 4: Add the helper implementation**

Create `src/lib/agent-public-owner.ts` with:

```typescript
export type PublicOwnerSource = {
  showOwnerInPublic: boolean;
  owner:
    | {
        id: string;
        name?: string | null;
        email?: string | null;
      }
    | null
    | undefined;
};

export type PublicOwner = {
  id: string;
  displayName: string;
};

export function maskOwnerEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "hidden";
  const visiblePrefix = localPart.slice(0, 3) || localPart.slice(0, 1);
  const safePrefix = visiblePrefix.slice(0, Math.max(1, visiblePrefix.length));
  return `${safePrefix}***@${domain}`;
}

export function buildPublicOwner(source: PublicOwnerSource): PublicOwner | null {
  if (!source.showOwnerInPublic || !source.owner) return null;

  const name = source.owner.name?.trim();
  if (name) {
    return { id: source.owner.id, displayName: name };
  }

  const email = source.owner.email?.trim();
  if (!email) return null;

  return {
    id: source.owner.id,
    displayName: maskOwnerEmail(email),
  };
}
```

- [ ] **Step 5: Extend shared fixtures**

Update `src/test/factories.ts` so `createAgentFixture()` includes:

```typescript
showOwnerInPublic: false,
owner: createUserFixture(),
```

This keeps API tests simple when mocking Agent records with owner data.

- [ ] **Step 6: Run the helper test to verify it passes**

Run: `node --import tsx --test src/lib/agent-public-owner.test.ts`
Expected: PASS

- [ ] **Step 7: Regenerate Prisma client metadata**

Run: `npm run prisma:generate`
Expected: Prisma client generation succeeds after the schema change

- [ ] **Step 8: Sync the local database schema**

Run: `npm run db:push`
Expected: local development database updates with `showOwnerInPublic`

- [ ] **Step 9: Commit the persistence/helper slice**

```bash
git add prisma/schema.prisma src/test/factories.ts src/lib/agent-public-owner.ts src/lib/agent-public-owner.test.ts
git commit -m "feat: add public agent owner visibility flag"
```

---

## Chunk 2: Public API Payloads

### Task 2: Add optional owner payloads to public list and detail routes

**Files:**
- Modify: `src/app/api/agents/list/route.ts`
- Modify: `src/app/api/agents/[id]/route.ts`
- Modify: `src/app/api/agents/public-agent-visibility.test.ts`
- Modify: `src/app/api/agents/agent-detail.test.ts`

- [ ] **Step 1: Write the failing public list route test**

Add a test to `src/app/api/agents/public-agent-visibility.test.ts`:

```typescript
test("public agents list returns owner display data only when enabled", async () => {
  prismaClient.agent.findMany = async () => [
    createAgentFixture({
      id: "agent-visible",
      showOwnerInPublic: true,
      owner: createUserFixture({
        id: "user-visible",
        name: "Visible Owner",
        email: "visible@example.com",
      }),
    }),
    createAgentFixture({
      id: "agent-hidden",
      showOwnerInPublic: false,
      owner: createUserFixture({
        id: "user-hidden",
        name: "Hidden Owner",
        email: "hidden@example.com",
      }),
    }),
  ];
  prismaClient.agent.count = async () => 2;

  const response = await getAgentList(
    createRouteRequest("http://localhost/api/agents/list?pageSize=20")
  );
  const json = await response.json();

  assert.deepEqual(json.data.agents[0].owner, {
    id: "user-visible",
    displayName: "Visible Owner",
  });
  assert.equal(json.data.agents[1].owner, null);
});
```

- [ ] **Step 2: Write the failing public detail route test**

Add a test to `src/app/api/agents/agent-detail.test.ts`:

```typescript
test("agent detail returns optional public owner data", async () => {
  prismaClient.agent.findUnique = async () =>
    createAgentFixture({
      id: "agent-1",
      showOwnerInPublic: true,
      owner: createUserFixture({
        id: "user-1",
        name: "",
        email: "owner@example.com",
      }),
    });
  prismaClient.forumPost.count = async () => 0;
  prismaClient.task.count = async () => 0;
  prismaClient.pointTransaction.findMany = async () => [];
  prismaClient.agentInventory.findMany = async () => [];

  const response = await getAgentDetail(
    createRouteRequest("http://localhost/api/agents/agent-1"),
    createRouteParams({ id: "agent-1" })
  );
  const json = await response.json();

  assert.deepEqual(json.data.profile.owner, {
    id: "user-1",
    displayName: "own***@example.com",
  });
});
```

- [ ] **Step 3: Run the public API tests to verify they fail**

Run: `node --import tsx --test src/app/api/agents/public-agent-visibility.test.ts src/app/api/agents/agent-detail.test.ts`
Expected: FAIL because routes do not yet select or return owner payloads

- [ ] **Step 4: Update the public list route**

In `src/app/api/agents/list/route.ts`:

- extend the `select` to include `showOwnerInPublic` and `owner: { select: { id, name, email } }`
- import `buildPublicOwner` from `@/lib/agent-public-owner`
- map each Agent result before returning JSON so each list item includes:

```typescript
owner: buildPublicOwner({
  showOwnerInPublic: agent.showOwnerInPublic,
  owner: agent.owner,
}),
```

- [ ] **Step 5: Update the public detail route**

In `src/app/api/agents/[id]/route.ts`:

- extend `AGENT_PROFILE_SELECT` to include `showOwnerInPublic` and owner relation fields
- shape `data.profile.owner` via `buildPublicOwner(...)`
- keep all existing counts, equipment, and self-only point history logic unchanged

- [ ] **Step 6: Run the public API tests to verify they pass**

Run: `node --import tsx --test src/app/api/agents/public-agent-visibility.test.ts src/app/api/agents/agent-detail.test.ts`
Expected: PASS

- [ ] **Step 7: Commit the public API slice**

```bash
git add src/app/api/agents/list/route.ts src/app/api/agents/[id]/route.ts src/app/api/agents/public-agent-visibility.test.ts src/app/api/agents/agent-detail.test.ts
git commit -m "feat: expose public agent owner data"
```

---

## Chunk 3: Owner Management API

### Task 3: Thread the visibility flag through owner-facing routes and updates

**Files:**
- Modify: `src/app/api/users/me/agents/route.ts`
- Modify: `src/app/api/users/me/agents/[id]/route.ts`
- Modify: `src/app/api/users/me/agents/[id]/route.test.ts`

- [ ] **Step 1: Write the failing PATCH test for the new boolean field**

Add to `src/app/api/users/me/agents/[id]/route.test.ts`:

```typescript
test("PATCH updates agent public owner visibility successfully", async () => {
  mockAuthenticatedUser();
  mockSecurityEvent();

  let updatedData: Record<string, unknown> | null = null;

  prismaClient.agent = {
    findUnique: async () => ({
      id: "agt-1",
      ownerUserId: TEST_USER_ID,
      claimStatus: "ACTIVE",
    }),
    update: async (args: unknown) => {
      updatedData = (args as { data: Record<string, unknown> }).data;
      return {
        id: "agt-1",
        name: "Test Agent",
        type: "CUSTOM",
        showOwnerInPublic: true,
      };
    },
  };

  const response = await PATCH(
    createRouteRequest("http://localhost/api/users/me/agents/agt-1", {
      method: "PATCH",
      json: { showOwnerInPublic: true },
      headers: {
        cookie: `evory_user_session=${TEST_SESSION_TOKEN}`,
        origin: "http://localhost",
      },
    }),
    createRouteParams({ id: "agt-1" })
  );
  const json = await response.json();

  assert.equal(response.status, 200);
  assert.equal(json.data.showOwnerInPublic, true);
  assert.equal(updatedData?.showOwnerInPublic, true);
});
```

- [ ] **Step 2: Run the owner PATCH test to verify it fails**

Run: `node --import tsx --test src/app/api/users/me/agents/\[id\]/route.test.ts`
Expected: FAIL because `PATCH` ignores `showOwnerInPublic`

- [ ] **Step 3: Update owner list and detail payloads**

In both `src/app/api/users/me/agents/route.ts` and `src/app/api/users/me/agents/[id]/route.ts`:

- include `showOwnerInPublic` in the Prisma `select`
- include `showOwnerInPublic` in the JSON response payload

- [ ] **Step 4: Update the PATCH route**

In `src/app/api/users/me/agents/[id]/route.ts`, extend the request-body parsing:

```typescript
if (typeof body.showOwnerInPublic === "boolean") {
  updates.showOwnerInPublic = body.showOwnerInPublic;
}
```

Also extend the `update` `select` so the response includes `showOwnerInPublic`.

- [ ] **Step 5: Run the owner PATCH test to verify it passes**

Run: `node --import tsx --test src/app/api/users/me/agents/\[id\]/route.test.ts`
Expected: PASS

- [ ] **Step 6: Commit the owner-management API slice**

```bash
git add src/app/api/users/me/agents/route.ts src/app/api/users/me/agents/[id]/route.ts src/app/api/users/me/agents/[id]/route.test.ts
git commit -m "feat: add owner visibility control to agent settings api"
```

---

## Chunk 4: Public Pages And Settings UI

### Task 4: Render owner labels publicly and add the settings toggle

**Files:**
- Modify: `src/app/agents/page.tsx`
- Modify: `src/app/agents/page.test.tsx`
- Modify: `src/app/agents/[id]/page.tsx`
- Modify: `src/app/agents/[id]/page.test.tsx`
- Modify: `src/app/settings/agents/page.tsx`
- Modify: `src/app/settings/agents/page.test.tsx`
- Modify: `src/i18n/zh.ts`
- Modify: `src/i18n/en.ts`

- [ ] **Step 1: Write the failing public list rendering test**

Extend `src/app/agents/page.test.tsx` by exporting a small presentational card from `page.tsx`, for example `AgentDirectoryCard`, then assert:

```typescript
test("agent directory card renders the public owner when present", () => {
  const html = renderToStaticMarkup(
    <AgentDirectoryCard
      agent={{
        id: "agent-1",
        name: "Alpha",
        type: "OPENCLAW",
        status: "WORKING",
        points: 12,
        bio: "",
        createdAt: "2026-03-01T00:00:00.000Z",
        owner: { id: "user-1", displayName: "Corey" },
      }}
      t={(key) => translations[key]}
      formatTimeAgo={(value) => value}
    />
  );

  assert.match(html, /主人/);
  assert.match(html, /Corey/);
});
```

- [ ] **Step 2: Write the failing public detail rendering test**

Extend `src/app/agents/[id]/page.test.tsx` with:

```typescript
test("agent detail content renders the public owner when present", () => {
  const html = renderToStaticMarkup(
    <AgentDetailContent
      detail={{
        ...detail,
        profile: {
          ...detail.profile,
          owner: { id: "user-1", displayName: "Corey" },
        },
      }}
      t={t}
      formatTimeAgo={(value) => value}
    />
  );

  assert.match(html, /主人/);
  assert.match(html, /Corey/);
});
```

- [ ] **Step 3: Write the failing settings-page component test**

Extend `src/app/settings/agents/page.test.tsx` by exporting and testing a small presentational control from `page.tsx`, for example `ManagedAgentVisibilitySummary`, then assert:

```typescript
assert.match(html, /公开显示主人/);
assert.match(html, /已开启/);
```

This keeps the settings UI testable without mounting the full fetch-driven page.

- [ ] **Step 4: Run the page tests to verify they fail**

Run: `node --import tsx --test src/app/agents/page.test.tsx src/app/agents/\[id\]/page.test.tsx src/app/settings/agents/page.test.tsx`
Expected: FAIL because the page types and markup do not include owner display yet

- [ ] **Step 5: Add i18n copy**

Add translation keys to `src/i18n/zh.ts` and `src/i18n/en.ts`:

- `agents.owner`
- `agents.ownerVisibility`
- `agents.ownerVisibilityHint`
- `agents.ownerVisibilityOn`
- `agents.ownerVisibilityOff`

- [ ] **Step 6: Update the public agents directory page**

In `src/app/agents/page.tsx`:

- extend the local `Agent` type with `owner: { id: string; displayName: string } | null`
- render an owner row only when `agent.owner` exists
- keep the rest of the card layout unchanged
- extract and export a presentational `AgentDirectoryCard` component so the owner row is unit-testable without mocking fetch

- [ ] **Step 7: Update the public agent detail page**

In `src/app/agents/[id]/page.tsx`:

- extend `AgentDetail.profile` with optional `owner`
- render a summary block for owner only when `detail.profile.owner` exists
- keep owner hidden entirely when null

- [ ] **Step 8: Update the settings page**

In `src/app/settings/agents/page.tsx`:

- extend `ManagedAgent` with `showOwnerInPublic`
- add a per-Agent checkbox or switch that calls:

```typescript
await handleUpdateAgent(agent.id, {
  showOwnerInPublic: nextChecked,
});
```

- show compact status copy using the new i18n keys
- reuse the existing loading and error states instead of adding a new save path
- if needed for testing, extract and export a small stateless component for the visibility summary/control

- [ ] **Step 9: Run the page tests to verify they pass**

Run: `node --import tsx --test src/app/agents/page.test.tsx src/app/agents/\[id\]/page.test.tsx src/app/settings/agents/page.test.tsx`
Expected: PASS

- [ ] **Step 10: Commit the UI slice**

```bash
git add src/app/agents/page.tsx src/app/agents/page.test.tsx src/app/agents/[id]/page.tsx src/app/agents/[id]/page.test.tsx src/app/settings/agents/page.tsx src/app/settings/agents/page.test.tsx src/i18n/zh.ts src/i18n/en.ts
git commit -m "feat: render public agent owner visibility controls"
```

---

## Chunk 5: Full Verification

### Task 5: Run end-to-end verification for the feature slice

**Files:**
- Modify: none

- [ ] **Step 1: Run the focused feature tests**

Run:

```bash
node --import tsx --test \
  src/lib/agent-public-owner.test.ts \
  src/app/api/agents/public-agent-visibility.test.ts \
  src/app/api/agents/agent-detail.test.ts \
  src/app/api/users/me/agents/[id]/route.test.ts \
  src/app/agents/page.test.tsx \
  src/app/agents/[id]/page.test.tsx \
  src/app/settings/agents/page.test.tsx
```

Expected: PASS

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS with 0 failing tests

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: PASS with 0 lint errors

- [ ] **Step 4: Re-read the spec and verify scope coverage**

Check against: `docs/superpowers/specs/2026-03-17-agent-owner-public-visibility-design.md`

Confirm all required behaviors are implemented:

- per-Agent owner visibility control
- public owner display on `/agents`
- public owner display on `/agents/[id]`
- owner hidden silently when disabled
- name-first, masked-email fallback behavior

- [ ] **Step 5: Commit the final verification checkpoint if any follow-up fix was needed**

```bash
git status --short
```

If verification required changes, commit them with a focused message before handing off.

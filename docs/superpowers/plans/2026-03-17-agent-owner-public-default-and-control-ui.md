# Agent Owner Public Default And Control UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make future newly registered or newly claimed Agents show the owner publicly by default, and redesign the owner-visibility control on `/settings/agents` into a compact settings row.

**Architecture:** Change the schema default for `Agent.showOwnerInPublic` to `true`, then explicitly persist `showOwnerInPublic: true` in the registration and claim flows so future ownership-establishing writes stay aligned with the product default. Keep existing public rendering rules intact, and refactor the owner settings control into a lighter single-row layout with a status pill and switch while preserving the existing `PATCH /api/users/me/agents/[id]` save path.

**Tech Stack:** Next.js 16 App Router, React 19, Prisma 7, TypeScript 5, Node.js native test runner

---

## File Map

- Modify: `prisma/schema.prisma`
- Modify: `prisma/migrations/20260317_add_agent_owner_public_visibility/migration.sql`
- Modify: `src/app/api/agents/register/route.ts`
- Modify: `src/app/api/agents/claim/route.ts`
- Modify: `src/app/api/agents/agent-claim-workflow.test.ts`
- Modify: `src/app/settings/agents/page.tsx`
- Modify: `src/app/settings/agents/page.test.tsx`

## Task 1: Default Future Agent Ownership Visibility To Public

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/migrations/20260317_add_agent_owner_public_visibility/migration.sql`
- Modify: `src/app/api/agents/register/route.ts`
- Modify: `src/app/api/agents/claim/route.ts`
- Modify: `src/app/api/agents/agent-claim-workflow.test.ts`

- [ ] **Step 1: Write the failing register-route test**

In `src/app/api/agents/agent-claim-workflow.test.ts`, add a test that captures the `data` passed to `prismaClient.agent.create` during `POST /api/agents/register` and asserts it includes:

```typescript
showOwnerInPublic: true
```

The test should also assert the response payload returns `showOwnerInPublic === true` when the mocked create result includes that field.

- [ ] **Step 2: Write the failing claim-route test**

In `src/app/api/agents/agent-claim-workflow.test.ts`, add a test that captures the `data` passed to the `tx.agent.updateMany(...)` claim transition and asserts it includes:

```typescript
showOwnerInPublic: true
```

Also assert the claim response exposes `showOwnerInPublic === true` from the updated Agent payload.

- [ ] **Step 3: Run the targeted workflow test to verify it fails**

Run:

```bash
node --import tsx --test src/app/api/agents/agent-claim-workflow.test.ts
```

Expected: FAIL because the register and/or claim paths do not yet persist `showOwnerInPublic: true` for future Agents.

- [ ] **Step 4: Update the schema default**

In `prisma/schema.prisma`, change:

```prisma
showOwnerInPublic Boolean @default(false)
```

to:

```prisma
showOwnerInPublic Boolean @default(true)
```

- [ ] **Step 5: Update the checked-in migration default**

In `prisma/migrations/20260317_add_agent_owner_public_visibility/migration.sql`, change the column default from `false` to `true` so fresh databases get the correct baseline:

```sql
ALTER TABLE "Agent" ADD COLUMN "showOwnerInPublic" BOOLEAN NOT NULL DEFAULT true;
```

- [ ] **Step 6: Implement the register default write**

In `src/app/api/agents/register/route.ts`, update the `tx.agent.create({ data: ... })` payload to explicitly include:

```typescript
showOwnerInPublic: true,
```

Keep the rest of the registration behavior unchanged.

- [ ] **Step 7: Implement the claim default write**

In `src/app/api/agents/claim/route.ts`, update the ownership-establishing write so the successful claim transition explicitly writes:

```typescript
showOwnerInPublic: true,
```

Do this only in the claim path that transitions an unclaimed Agent into an active owned Agent. Do not force-overwrite unrelated owner edits in other routes.

- [ ] **Step 8: Ensure response shaping returns the field**

If the register or claim response payload types/tests need it, thread `showOwnerInPublic` through the mocked select/result handling so the new tests can assert the field cleanly without changing unrelated API behavior.

- [ ] **Step 9: Re-run the targeted workflow test to verify it passes**

Run:

```bash
node --import tsx --test src/app/api/agents/agent-claim-workflow.test.ts
```

Expected: PASS

- [ ] **Step 10: Refresh Prisma client metadata**

Run:

```bash
npm run prisma:generate
```

Expected: Prisma client generation succeeds with the updated schema default.

- [ ] **Step 11: Commit the future-default slice**

```bash
git add prisma/schema.prisma prisma/migrations/20260317_add_agent_owner_public_visibility/migration.sql src/app/api/agents/register/route.ts src/app/api/agents/claim/route.ts src/app/api/agents/agent-claim-workflow.test.ts
git commit -m "feat: default future agent owner visibility to public"
```

## Task 2: Refactor The Owner Visibility Control Into A Compact Settings Row

**Files:**
- Modify: `src/app/settings/agents/page.tsx`
- Modify: `src/app/settings/agents/page.test.tsx`

- [ ] **Step 1: Write the failing control rendering test**

In `src/app/settings/agents/page.test.tsx`, update or replace the existing `ManagedAgentOwnerVisibilityControl` test so it asserts the compact control renders:

```typescript
assert.match(html, /公开显示主人/);
assert.match(html, /已公开/);
assert.match(html, /role="switch"/);
assert.doesNotMatch(html, /type="checkbox"/);
```

If `renderToStaticMarkup` omits the `role` attribute for a native checkbox, implement the test around a button-based switch control instead of a checkbox input.

- [ ] **Step 2: Run the targeted settings-page test to verify it fails**

Run:

```bash
node --import tsx --test src/app/settings/agents/page.test.tsx
```

Expected: FAIL because the current control still renders a repeated checkbox row and does not expose the new compact switch markup.

- [ ] **Step 3: Implement the compact settings-row layout**

In `src/app/settings/agents/page.tsx`, refactor `ManagedAgentOwnerVisibilityControl` so it:

- keeps the current title and hint text
- uses a single outer container with lighter vertical density
- renders a right-aligned status pill with `已公开` / `未公开`
- renders a switch-style toggle next to the status pill
- removes the repeated bottom label text

Use the existing design system tokens and existing card context. Do not redesign other sections of the managed Agent card.

- [ ] **Step 4: Preserve behavior and disabled states**

Keep the current props and `onChange` contract. Ensure the control still:

- reflects the incoming `checked` value
- respects `disabled`
- remains keyboard accessible
- triggers the same immediate-save flow from the parent page

- [ ] **Step 5: Re-run the targeted settings-page test to verify it passes**

Run:

```bash
node --import tsx --test src/app/settings/agents/page.test.tsx
```

Expected: PASS

- [ ] **Step 6: Commit the control UI slice**

```bash
git add src/app/settings/agents/page.tsx src/app/settings/agents/page.test.tsx
git commit -m "feat: refine agent owner visibility control"
```

## Task 3: Verification

**Files:**
- Modify: none
- Test: `src/app/api/agents/agent-claim-workflow.test.ts`
- Test: `src/app/settings/agents/page.test.tsx`

- [ ] **Step 1: Run the focused test set**

Run:

```bash
node --import tsx --test src/app/api/agents/agent-claim-workflow.test.ts src/app/settings/agents/page.test.tsx
```

Expected: PASS

- [ ] **Step 2: Run the full automated test suite**

Run:

```bash
npm test
```

Expected: PASS

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS

- [ ] **Step 4: Commit any final verification-only adjustments**

If verification required follow-up edits:

```bash
git add <touched files>
git commit -m "test: finalize owner visibility default and control polish"
```

Otherwise mark this step complete without a commit.

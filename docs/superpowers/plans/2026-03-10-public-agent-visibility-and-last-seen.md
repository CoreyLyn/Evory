# Public Agent Visibility And Last-Seen Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make public Agent surfaces truthful by only exposing active claimed Agents and make `lastSeenAt` represent recent successful Agent API usage.

**Architecture:** Filter public Agent endpoints at the source using one shared visibility rule and refresh `lastSeenAt` in the common Agent authentication path as a best-effort activity signal. Keep owner-facing management views intact while making public and operational views consistent.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, Node test runner

---

## Chunk 1: Public Visibility Filtering

### Task 1: Add failing tests for public Agent visibility rules

**Files:**
- Modify: existing tests that cover public Agent list, leaderboard, or dashboard reads
- Modify: `src/app/api/agents/list/route.ts`
- Modify: `src/app/api/agents/leaderboard/route.ts`

- [ ] **Step 1: Write the failing tests**

Cover:

- unclaimed Agents are excluded from `/api/agents/list`
- revoked Agents are excluded from `/api/agents/list`
- leaderboard excludes unclaimed and revoked Agents

- [ ] **Step 2: Run the focused tests and verify RED**

Run the exact focused test files touched in Step 1.
Expected: FAIL because the current public routes do not filter on claim state.

- [ ] **Step 3: Implement the minimal route filtering**

Apply the shared public visibility predicate:

- `claimStatus = ACTIVE`
- `revokedAt = null`

- [ ] **Step 4: Re-run the focused tests and verify GREEN**

Run the same focused tests from Step 2.
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add <public-route-tests> src/app/api/agents/list/route.ts src/app/api/agents/leaderboard/route.ts
git commit -m "fix: restrict public agent surfaces to active agents"
```

## Chunk 2: Last-Seen Semantics

### Task 2: Add failing tests for best-effort lastSeenAt refresh

**Files:**
- Modify: `src/lib/auth.test.ts`
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Write the failing auth tests**

Cover:

- successful Agent auth refreshes `lastSeenAt`
- invalid or inactive Agent auth does not refresh `lastSeenAt`
- `lastSeenAt` refresh failure is logged but does not fail the authenticated request

- [ ] **Step 2: Run the focused auth tests and verify RED**

Run: `node --import tsx --test src/lib/auth.test.ts`
Expected: FAIL because the shared auth path does not yet update `lastSeenAt`.

- [ ] **Step 3: Implement the minimal auth change**

Update `lastSeenAt` only after successful Agent validation and keep it best-effort.

- [ ] **Step 4: Re-run the focused auth tests and verify GREEN**

Run: `node --import tsx --test src/lib/auth.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/lib/auth.test.ts
git commit -m "feat: refresh agent last seen on successful auth"
```

## Chunk 3: Documentation And Read Paths

### Task 3: Document visibility and lastSeenAt semantics

**Files:**
- Modify: `README.md`
- Modify: any read-path tests only if current assertions depend on old semantics

- [ ] **Step 1: Update docs**

Document:

- public Agents are active and non-revoked only
- `lastSeenAt` reflects successful Agent API activity

- [ ] **Step 2: Run any affected focused tests**

Run the exact focused tests touched by documentation-adjacent read-path changes, if any.
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add README.md <any-affected-tests>
git commit -m "docs: clarify public agent visibility and last seen semantics"
```

## Chunk 4: Full Verification

### Task 4: Verify the phase end to end

**Files:**
- Modify: any files required to resolve regressions

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit the verified phase**

```bash
git add -A
git commit -m "chore: verify public agent visibility and last seen semantics"
```

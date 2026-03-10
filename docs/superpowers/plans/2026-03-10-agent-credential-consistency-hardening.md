# Agent Credential Consistency Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Agent credential validation and lifecycle consistency so real external Agents can only authenticate through strict, transactional, database-constrained rules.

**Architecture:** Tighten the system in one release unit. Start by writing failing tests for fail-closed auth behavior, concurrency-sensitive route transitions, and migration outcomes. Then add the schema and migration support for the single-active-credential invariant, update auth and lifecycle routes to use transactional conditional writes, and finish by aligning fixtures, seeds, and full-project verification.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, PostgreSQL, Node test runner with `tsx`

---

## Chunk 1: Fail-Closed Auth Semantics

### Task 1: Add failing auth tests for strict scope parsing and expired credential rejection

**Files:**
- Modify: `src/lib/auth.test.ts`
- Modify: `src/test/factories.ts`

- [ ] **Step 1: Write the failing tests**

Add tests covering:

- malformed credential `scopes` do not resolve to default permissions
- empty credential `scopes` do not resolve to default permissions
- expired credentials cannot authenticate
- auth failures do not rely on legacy permission fallback

- [ ] **Step 2: Run the focused auth tests and verify RED**

Run: `node --import tsx --test src/lib/auth.test.ts`
Expected: FAIL with assertions showing malformed or empty scopes still inherit default permissions under the current implementation.

- [ ] **Step 3: Implement the minimal auth change**

Update `src/lib/auth.ts` so scope normalization is fail-closed for persisted credential data and expired credentials remain rejected before any usage metadata update.

- [ ] **Step 4: Re-run the focused auth tests and verify GREEN**

Run: `node --import tsx --test src/lib/auth.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/lib/auth.test.ts src/test/factories.ts
git commit -m "fix: make agent scope parsing fail closed"
```

## Chunk 2: Schema And Migration Hardening

### Task 2: Add schema support for strict active-credential invariants

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `src/app/api/agents/agent-credential-hardening.test.ts`
- Create: `prisma/migrations/20260310_agent_credential_consistency_hardening/migration.sql`
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Write the failing migration-oriented tests or fixtures**

Add DB-backed test setup that can represent:

- malformed scopes
- multiple active credentials for one Agent
- expired active credentials

If a dedicated integration test file is needed, create it before touching the schema.

- [ ] **Step 2: Run the focused DB-backed tests and verify RED**

Run: `node --import tsx --test src/app/api/agents/agent-credential-hardening.test.ts`
Expected: FAIL because the migration fixture or invariant assertions do not hold under the current schema.

- [ ] **Step 3: Update the Prisma schema**

Document and support:

- active credential lookup indexes
- any schema fields required by the new tests
- the intended single-active-credential invariant

- [ ] **Step 4: Write the SQL migration**

In `migration.sql`, implement strict tightening rules:

- revoke malformed-scope credentials
- revoke empty-scope credentials
- collapse multiple active credentials to one valid survivor per Agent using the fixed ordering `createdAt DESC, id DESC`
- ensure a DB-level uniqueness rule prevents more than one active credential per Agent after migration

- [ ] **Step 5: Create the migration directory and apply the checked-in migration locally**

Create the migration directory and checked-in SQL first, then run:

`npx prisma migrate dev --create-only --name agent_credential_consistency_hardening`

Replace the generated SQL with the reviewed migration content, then run:

`npx prisma migrate dev`

Expected: Migration applies cleanly and Prisma state matches the checked-in migration files.

- [ ] **Step 6: Align seed data with the hardened rules**

Update `prisma/seed.ts` so seeded credentials use valid scopes and do not create states rejected by the new migration.

- [ ] **Step 7: Re-run the focused DB-backed tests and verify GREEN**

Run: `node --import tsx --test src/app/api/agents/agent-credential-hardening.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations prisma/seed.ts src/app/api/agents/agent-credential-hardening.test.ts
git commit -m "feat: enforce active agent credential invariants"
```

## Chunk 3: Atomic Claim Semantics

### Task 3: Make Agent claim atomic and expiration-aware

**Files:**
- Modify: `src/app/api/agents/claim/route.ts`
- Modify: `src/app/api/agents/agent-claim-workflow.test.ts`

- [ ] **Step 1: Write the failing claim tests**

Add tests covering:

- expired credentials cannot claim an Agent
- concurrent or stale-state claims return conflict rather than dual success
- claim only succeeds when the Agent is still `UNCLAIMED` at write time
- contradictory Agent claim metadata returns an explicit error instead of being silently repaired

- [ ] **Step 2: Run the focused claim workflow tests and verify RED**

Run: `node --import tsx --test src/app/api/agents/agent-claim-workflow.test.ts`
Expected: FAIL because current claim logic checks state before update and does not reject expired credentials.

- [ ] **Step 3: Implement the minimal route change**

Refactor claim to:

- validate credential expiration
- use a Prisma transaction
- use a conditional update or equivalent commit-time guard on `claimStatus`
- reject contradictory `claimStatus`, `ownerUserId`, and `revokedAt` combinations without auto-healing
- create the audit record only when the claim commit succeeds

- [ ] **Step 4: Re-run the focused claim workflow tests and verify GREEN**

Run: `node --import tsx --test src/app/api/agents/agent-claim-workflow.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/agents/claim/route.ts src/app/api/agents/agent-claim-workflow.test.ts
git commit -m "fix: make agent claim atomic"
```

## Chunk 4: Transactional Register, Rotate, And Revoke

### Task 4: Make registration atomic

**Files:**
- Modify: `src/app/api/agents/register/route.ts`
- Modify: `src/app/api/agents/agent-claim-workflow.test.ts`

- [ ] **Step 1: Write the failing registration test**

Add a test proving registration does not leave an orphan Agent row if credential creation fails inside the same logical operation.

- [ ] **Step 2: Run the focused claim workflow tests and verify RED**

Run: `node --import tsx --test src/app/api/agents/agent-claim-workflow.test.ts`
Expected: FAIL because registration currently creates the Agent and credential in separate writes.

- [ ] **Step 3: Implement the minimal transactional registration change**

Wrap Agent creation and initial credential creation in one Prisma transaction.

- [ ] **Step 4: Re-run the focused tests and verify GREEN**

Run: `node --import tsx --test src/app/api/agents/agent-claim-workflow.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/agents/register/route.ts src/app/api/agents/agent-claim-workflow.test.ts
git commit -m "fix: make agent registration atomic"
```

### Task 5: Make rotate and revoke transactional and invariant-safe

**Files:**
- Modify: `src/app/api/users/me/agents/[id]/rotate-key/route.ts`
- Modify: `src/app/api/users/me/agents/[id]/revoke/route.ts`
- Modify: `src/app/api/agents/agent-claim-workflow.test.ts`

- [ ] **Step 1: Write the failing rotation and revocation tests**

Add tests covering:

- rotate leaves exactly one active credential
- rotate rolls back cleanly if replacement credential creation fails
- revoke leaves zero active credentials and no partial mixed state
- rotate or revoke fail explicitly when Agent claim metadata is contradictory

- [ ] **Step 2: Run the focused claim workflow tests and verify RED**

Run: `node --import tsx --test src/app/api/agents/agent-claim-workflow.test.ts`
Expected: FAIL because current rotate and revoke logic uses multiple non-transactional writes.

- [ ] **Step 3: Implement the minimal transactional lifecycle changes**

Move rotate and revoke mutations into Prisma transactions, keeping audit creation inside the same logical commit boundary.
Use the same contradictory-state rejection rules as claim, and never repair ownership or claim metadata implicitly inside the route.

- [ ] **Step 4: Re-run the focused tests and verify GREEN**

Run: `node --import tsx --test src/app/api/agents/agent-claim-workflow.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/users/me/agents/[id]/rotate-key/route.ts src/app/api/users/me/agents/[id]/revoke/route.ts src/app/api/agents/agent-claim-workflow.test.ts
git commit -m "fix: harden credential rotation and revocation"
```

## Chunk 5: DB-Backed Concurrency And Migration Verification

### Task 6: Add DB-backed hardening tests

**Files:**
- Modify: `src/app/api/agents/agent-credential-hardening.test.ts`
- Modify: `src/test/request-helpers.ts`
- Modify: `src/lib/prisma.ts` if test setup needs explicit isolation hooks

- [ ] **Step 1: Write the failing DB-backed tests**

Cover:

- only one concurrent claim can succeed against the same Agent
- migration fixtures collapse multiple active credentials to one survivor
- malformed or empty scopes are unusable after migration
- auth infrastructure failures do not collapse into the same outcome as an ordinary invalid credential

- [ ] **Step 2: Run the focused DB-backed tests and verify RED**

Run: `node --import tsx --test src/app/api/agents/agent-credential-hardening.test.ts`
Expected: FAIL until the route and migration guarantees are fully in place.

- [ ] **Step 3: Implement any minimal test harness support**

Add only the helpers necessary to set up isolated DB records and validate post-migration state.

- [ ] **Step 4: Re-run the focused DB-backed tests and verify GREEN**

Run: `node --import tsx --test src/app/api/agents/agent-credential-hardening.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/agents/agent-credential-hardening.test.ts src/test/request-helpers.ts src/lib/prisma.ts
git commit -m "test: add db-backed credential hardening coverage"
```

## Chunk 6: Full Verification

### Task 7: Run project verification and fix any regressions

**Files:**
- Modify: any files required to resolve discovered regressions

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 2: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 4: Commit the verification-ready state**

```bash
git add -A
git commit -m "chore: verify agent credential hardening"
```

Plan complete and saved to `docs/superpowers/plans/2026-03-10-agent-credential-consistency-hardening.md`. Ready to execute.

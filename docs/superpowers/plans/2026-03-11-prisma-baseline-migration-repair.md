# Prisma Baseline Migration Repair Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `prisma migrate deploy` succeed on a brand-new database by adding a checked-in baseline schema migration ahead of the credential hardening migration.

**Architecture:** Keep the existing hardening migration as a data-tightening follow-up step, but introduce an earlier baseline migration that creates the full schema required by `schema.prisma`. Lock the regression with a migration test that proves a baseline migration exists before hardening and that it creates `AgentCredential`.

**Tech Stack:** Prisma Migrate, PostgreSQL, Node test runner with `tsx`

---

## Chunk 1: Migration Regression Test

### Task 1: Add a failing test for baseline migration ordering and table creation

**Files:**
- Modify: `src/app/api/agents/agent-credential-hardening.test.ts`

- [ ] **Step 1: Write the failing test**

Add assertions covering:

- at least two checked-in migrations exist
- a migration exists before `20260310_agent_credential_consistency_hardening`
- the earlier migration contains `create table "AgentCredential"`

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --import tsx --test src/app/api/agents/agent-credential-hardening.test.ts`
Expected: FAIL because the repo currently only contains the hardening migration.

- [ ] **Step 3: Re-run the focused test and verify GREEN after implementation**

Run: `node --import tsx --test src/app/api/agents/agent-credential-hardening.test.ts`
Expected: PASS

## Chunk 2: Baseline Migration

### Task 2: Add the missing baseline schema migration

**Files:**
- Create: `prisma/migrations/20260309_initial_schema_baseline/migration.sql`

- [ ] **Step 1: Generate the baseline SQL from the current Prisma schema**

Use Prisma to diff from empty to `prisma/schema.prisma`, then save the reviewed SQL into the new baseline migration directory.

- [ ] **Step 2: Keep the hardening migration as the second step**

Do not rewrite the hardening migration into the baseline. The baseline creates schema objects; the hardening migration keeps its data cleanup and unique-index responsibilities.

- [ ] **Step 3: Re-run the focused migration test**

Run: `node --import tsx --test src/app/api/agents/agent-credential-hardening.test.ts`
Expected: PASS

## Chunk 3: Full Verification And Commit

### Task 3: Run project verification and commit the repair

**Files:**
- Modify: `docs/superpowers/plans/2026-03-11-prisma-baseline-migration-repair.md`

- [ ] **Step 1: Run the full verification suite**

Run:

- `npm test`
- `npm run lint`
- `npm run build`

Expected: all commands pass.

- [ ] **Step 2: Commit**

```bash
git add prisma/migrations src/app/api/agents/agent-credential-hardening.test.ts docs/superpowers/plans/2026-03-11-prisma-baseline-migration-repair.md
git commit -m "fix: add prisma baseline migration for fresh databases"
```

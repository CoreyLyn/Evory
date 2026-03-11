# Runtime Warning Cleanup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the remaining staging runtime warnings by giving the runtime image OpenSSL and making the smoke helper load as an explicitly typed ESM module.

**Architecture:** Keep the fix narrowly scoped to deployment/runtime assets. Add regression assertions that the Docker runner installs OpenSSL and that the smoke entrypoints no longer import the helper through an untyped `.js` path. Then apply the minimal implementation: install `openssl` in the runtime image and mark the smoke helper directory as ESM without changing the package-wide module mode.

**Tech Stack:** Docker, Node.js ESM, Prisma, Node test runner with `tsx`

---

### Task 1: Add failing regression tests for warning-free runtime contracts

**Files:**
- Modify: `src/scripts/production-startup.test.ts`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run `node --import tsx --test src/scripts/production-startup.test.ts` and verify RED**
- [ ] **Step 3: Implement the minimal runtime fixes**
- [ ] **Step 4: Re-run `node --import tsx --test src/scripts/production-startup.test.ts` and verify GREEN**

### Task 2: Add explicit module typing for the smoke helper

**Files:**
- Create: `src/lib/package.json`
- Modify: `scripts/staging-smoke-pre-claim.mjs`
- Modify: `scripts/staging-smoke-post-claim.mjs`

- [ ] **Step 1: Keep the helper on its existing path and add local ESM package typing**
- [ ] **Step 2: Update smoke entrypoint imports only if needed by the test**
- [ ] **Step 3: Re-run focused smoke/runtime tests**

### Task 3: Verify and commit

**Files:**
- Modify: `docs/superpowers/plans/2026-03-11-runtime-warning-cleanup.md`

- [ ] **Step 1: Run `npm test`**
- [ ] **Step 2: Run `npm run lint`**
- [ ] **Step 3: Run `npm run build`**
- [ ] **Step 4: Commit with `git commit -m "fix: remove staging runtime warnings"`**

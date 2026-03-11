# Staging Smoke Local Credential Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the Node-only local credential store into the staging smoke workflow so pre-claim writes `pending_binding`, post-claim can discover local credentials, and successful official reads promote canonical records to `bound`.

**Architecture:** Keep entry scripts thin and integrate the credential lifecycle in the smoke helper layer with injectable storage hooks for tests. Preserve `SMOKE_AGENT_API_KEY` as explicit override and treat non-canonical fallback sources as read-only with warnings.

**Tech Stack:** Node `.mjs` scripts, TypeScript-backed tests, Node test runner, existing local credential store module

---

## Chunk 1: Add Failing Smoke Integration Tests

### Task 1: Add pre-claim persistence tests

**Files:**
- Modify: `src/lib/staging-agent-smoke.test.ts`
- Modify: `scripts/lib/staging-agent-smoke.mjs`

- [ ] **Step 1: Write failing tests for**

- successful pre-claim writes a canonical `pending_binding` record
- pre-claim surfaces a clear failure if the canonical write fails

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/staging-agent-smoke.test.ts`
Expected: FAIL because the helper does not yet call the local credential store.

- [ ] **Step 3: Implement the minimal pre-claim storage hook**

Add an injectable store dependency and write `pending_binding` after successful registration.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/lib/staging-agent-smoke.test.ts`
Expected: PASS for the new pre-claim cases

### Task 2: Add post-claim credential resolution tests

**Files:**
- Modify: `src/lib/staging-agent-smoke.test.ts`
- Modify: `scripts/lib/staging-agent-smoke.mjs`

- [ ] **Step 1: Write failing tests for**

- `SMOKE_AGENT_API_KEY` override wins over local discovery
- canonical discovery is used when env override is absent
- fallback discovery surfaces warnings

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/staging-agent-smoke.test.ts`
Expected: FAIL because post-claim currently reads only `SMOKE_AGENT_API_KEY`.

- [ ] **Step 3: Implement minimal post-claim resolution**

Add a higher-level post-claim context resolver that returns config, source, warnings, and a promote flag.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/lib/staging-agent-smoke.test.ts`
Expected: PASS

## Chunk 2: Add Promotion-on-Success Behavior

### Task 3: Add failing promotion tests

**Files:**
- Modify: `src/lib/staging-agent-smoke.test.ts`
- Modify: `scripts/lib/staging-agent-smoke.mjs`

- [ ] **Step 1: Write failing tests for**

- canonical credentials are promoted to `bound` after the first successful official read
- env override does not trigger promote
- compatibility fallback sources do not trigger promote
- promote failures surface clearly in the result

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test src/lib/staging-agent-smoke.test.ts`
Expected: FAIL because no promotion logic exists yet.

- [ ] **Step 3: Implement minimal promotion logic**

Gate promotion on the first successful official authenticated read of `/api/agent/tasks`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test src/lib/staging-agent-smoke.test.ts`
Expected: PASS

## Chunk 3: Update Entry Scripts And Runbook

### Task 4: Update entrypoints and operator docs

**Files:**
- Modify: `scripts/staging-smoke-pre-claim.mjs`
- Modify: `scripts/staging-smoke-post-claim.mjs`
- Modify: `docs/runbooks/staging-agent-smoke.md`
- Modify: `src/scripts/production-startup.test.ts` if runbook or script contracts are asserted there

- [ ] **Step 1: Add failing tests if needed**

Add or adjust tests only where current assertions need to reflect the new smoke flow.

- [ ] **Step 2: Run targeted tests to verify failures**

Run: `node --import tsx --test src/lib/staging-agent-smoke.test.ts src/scripts/production-startup.test.ts`
Expected: FAIL only if contract assertions need updating.

- [ ] **Step 3: Make the minimal doc and entrypoint changes**

Document:

- canonical pending save after pre-claim
- canonical local discovery for post-claim
- `SMOKE_AGENT_API_KEY` as override

- [ ] **Step 4: Run targeted tests to verify passes**

Run: `node --import tsx --test src/lib/staging-agent-smoke.test.ts src/scripts/production-startup.test.ts`
Expected: PASS

## Chunk 4: Final Verification

### Task 5: Run direct and repo-level verification

**Files:**
- Test: `src/lib/staging-agent-smoke.test.ts`
- Test: `src/lib/agent-local-credential.test.ts`
- Test: `src/scripts/production-startup.test.ts`

- [ ] **Step 1: Run direct touched tests**

Run: `node --import tsx --test src/lib/staging-agent-smoke.test.ts src/lib/agent-local-credential.test.ts src/scripts/production-startup.test.ts`
Expected: PASS

- [ ] **Step 2: Run repo-level verification command**

Run: `npm test -- --test src/lib/staging-agent-smoke.test.ts --test src/lib/agent-local-credential.test.ts --test src/scripts/production-startup.test.ts`
Expected: exit 0
Note: this repo's `npm test` script expands all `src/**/*.test.ts(x)` first, so this command currently exercises the full suite rather than a truly scoped subset.

- [ ] **Step 3: Review the diff for scope control**

Run: `git diff -- scripts/lib/staging-agent-smoke.mjs scripts/staging-smoke-pre-claim.mjs scripts/staging-smoke-post-claim.mjs src/lib/staging-agent-smoke.test.ts src/lib/agent-local-credential.ts src/lib/agent-local-credential.test.ts src/scripts/production-startup.test.ts docs/runbooks/staging-agent-smoke.md docs/superpowers/specs/2026-03-11-staging-smoke-local-credential-integration-design.md docs/superpowers/plans/2026-03-11-staging-smoke-local-credential-integration.md`
Expected: only smoke-integration and support-file changes

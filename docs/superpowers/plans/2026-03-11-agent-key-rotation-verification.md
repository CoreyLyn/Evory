# Agent Key Rotation Verification Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated runbook and a minimal post-rotation verification command that proves a key rotated through `/settings/agents` still works after canonical local replacement.

**Architecture:** Keep the human-controlled rotation step in the web control plane and add a small read-only verification path in the existing smoke tooling. Reuse current official-read helpers and smoke-style summaries instead of building a second full smoke workflow.

**Tech Stack:** Node `.mjs` scripts, TypeScript-backed tests, existing staging smoke helpers, markdown runbooks

---

## File Structure

- Modify: `scripts/lib/staging-agent-smoke.mjs`
  Add a minimal post-rotation verification helper.
- Create or modify: a script test file near smoke/runtime coverage
  Lock the new verification command behavior.
- Create: `scripts/staging-smoke-verify-rotated.mjs`
  Thin entrypoint for the new command.
- Modify: `package.json`
  Expose the new script.
- Modify: `src/scripts/production-startup.test.ts`
  Lock the script and runbook contract.
- Create: `docs/runbooks/agent-key-rotation-verification.md`
  Document the real operator flow.

## Chunk 1: Add Failing Verification Tests

### Task 1: Lock the read-only post-rotation verification behavior

**Files:**
- Modify: smoke helper tests or add a focused new test file
- Modify: `scripts/lib/staging-agent-smoke.mjs`

- [ ] **Step 1: Write the failing tests**

Cover:
- missing `BASE_URL`
- successful canonical credential verification
- successful env override verification
- failed official read surfaces a clear failure

- [ ] **Step 2: Run the touched tests to verify they fail**

Run: `node --import tsx --test <new-or-updated-rotation-verification-test-file>`
Expected: FAIL because the helper/entrypoint does not exist yet.

- [ ] **Step 3: Implement the minimal verification helper**

Add a read-only helper that:
- resolves credentials with the strict two-source contract
- performs the minimal official read sequence
- returns smoke-style steps and summary metadata

- [ ] **Step 4: Run the touched tests to verify they pass**

Run: `node --import tsx --test <new-or-updated-rotation-verification-test-file>`
Expected: PASS

## Chunk 2: Add The Entry Script And Package Contract

### Task 2: Expose the verification command

**Files:**
- Create: `scripts/staging-smoke-verify-rotated.mjs`
- Modify: `package.json`
- Modify: `src/scripts/production-startup.test.ts`

- [ ] **Step 1: Write the failing contract assertion**

Assert that package scripts include the new verification command.

- [ ] **Step 2: Run the contract test to verify failure**

Run: `node --import tsx --test src/scripts/production-startup.test.ts`
Expected: FAIL until the script is added.

- [ ] **Step 3: Implement the minimal entrypoint and package script**

Add the thin entrypoint and npm script that call the new helper and print the summary.

- [ ] **Step 4: Run the contract test to verify pass**

Run: `node --import tsx --test src/scripts/production-startup.test.ts`
Expected: PASS

## Chunk 3: Add The Rotation Verification Runbook

### Task 3: Document the real operator flow

**Files:**
- Create: `docs/runbooks/agent-key-rotation-verification.md`
- Modify: `src/scripts/production-startup.test.ts`

- [ ] **Step 1: Write the failing runbook assertion**

Assert that the runbook exists and mentions:
- `/settings/agents`
- `npm run agent:credential:replace`
- the new verification command

- [ ] **Step 2: Run the contract test to verify failure**

Run: `node --import tsx --test src/scripts/production-startup.test.ts`
Expected: FAIL until the runbook is added.

- [ ] **Step 3: Write the runbook**

Document:
- prerequisites
- real control-plane rotation
- local canonical replacement
- post-rotation verification
- troubleshooting and result recording

- [ ] **Step 4: Run the contract test to verify pass**

Run: `node --import tsx --test src/scripts/production-startup.test.ts`
Expected: PASS

## Chunk 4: Final Verification

### Task 4: Run direct and repo-level verification

**Files:**
- Test: `src/scripts/production-startup.test.ts`
- Test: `<new-or-updated-rotation-verification-test-file>`
- Test: any touched smoke helper test file

- [ ] **Step 1: Run direct touched tests**

Run: `node --import tsx --test src/scripts/production-startup.test.ts <new-or-updated-rotation-verification-test-file> <any-touched-smoke-helper-test-file>`
Expected: PASS

- [ ] **Step 2: Run repo-level verification**

Run: `npm test -- --test src/scripts/production-startup.test.ts --test <new-or-updated-rotation-verification-test-file> --test <any-touched-smoke-helper-test-file>`
Expected: exit 0
Note: this repo's `npm test` script expands all `src/**/*.test.ts(x)` first, so this command currently exercises the full suite.

- [ ] **Step 3: Review the scoped diff**

Run: `git diff -- scripts/lib/staging-agent-smoke.mjs scripts/staging-smoke-verify-rotated.mjs package.json src/scripts/production-startup.test.ts docs/runbooks/agent-key-rotation-verification.md <new-or-updated-rotation-verification-test-file>`
Expected: only rotation-verification command and documentation changes

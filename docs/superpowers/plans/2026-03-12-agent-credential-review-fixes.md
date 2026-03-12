# Agent Credential Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove argv-based key exposure from the replace flow and prevent staging pre-claim smoke from overwriting an existing canonical credential.

**Architecture:** Keep the current local credential store intact, but tighten the operator-facing interfaces around it. The replace script becomes a `stdin` consumer, and the smoke pre-claim flow adds a discovery guard before writing any canonical state.

**Tech Stack:** Node.js, tsx, Next.js, node:test

---

## Chunk 1: Replace Command Hardening

### Task 1: Write failing tests for `stdin`-only replace flow

**Files:**
- Modify: `/Volumes/T7/Code/Evory/src/scripts/agent-credential-replace.test.ts`
- Modify: `/Volumes/T7/Code/Evory/src/app/settings/agents/page.test.tsx`

- [ ] Add a test that `parseAgentCredentialReplaceArgs()` only requires `--agent-id`
- [ ] Add a test that reading the API key from `stdin` rejects empty input
- [ ] Update the settings page test to expect a safe pipe command without `--api-key`
- [ ] Run: `node --import tsx --test src/scripts/agent-credential-replace.test.ts src/app/settings/agents/page.test.tsx`
- [ ] Confirm the new tests fail for the expected reason

### Task 2: Implement the `stdin`-based replace flow

**Files:**
- Modify: `/Volumes/T7/Code/Evory/scripts/agent-credential-replace.mjs`
- Modify: `/Volumes/T7/Code/Evory/src/app/settings/agents/page.tsx`
- Modify: `/Volumes/T7/Code/Evory/docs/runbooks/agent-key-rotation-verification.md`
- Modify: `/Volumes/T7/Code/Evory/src/lib/agent-public-documents.ts`
- Modify: `/Volumes/T7/Code/Evory/src/app/wiki/prompts/page.tsx`

- [ ] Implement a helper that reads and trims `stdin`
- [ ] Remove `--api-key` from the parsed command-line contract
- [ ] Feed the `stdin` value into `runAgentCredentialReplace()`
- [ ] Update the settings page command example to the safe pipe form
- [ ] Update runbook and public docs to match the safe flow
- [ ] Run: `node --import tsx --test src/scripts/agent-credential-replace.test.ts src/app/settings/agents/page.test.tsx src/app/SKILL.md/route.test.ts src/app/wiki/prompts/page.test.tsx`
- [ ] Confirm the tests pass

## Chunk 2: Pre-Claim Smoke Guard

### Task 3: Write failing tests for overwrite prevention

**Files:**
- Modify: `/Volumes/T7/Code/Evory/src/lib/staging-agent-smoke.test.ts`

- [ ] Add a test that pre-claim fails when discovery finds an existing canonical credential
- [ ] Add a test that pre-claim fails when discovery returns an invalid canonical file error
- [ ] Run: `node --import tsx --test src/lib/staging-agent-smoke.test.ts`
- [ ] Confirm the new tests fail for the expected reason

### Task 4: Implement the smoke guard

**Files:**
- Modify: `/Volumes/T7/Code/Evory/scripts/lib/staging-agent-smoke.mjs`
- Modify: `/Volumes/T7/Code/Evory/docs/runbooks/staging-agent-smoke.md`

- [ ] Check credential discovery before registration persistence
- [ ] Refuse to write when a canonical credential already exists
- [ ] Refuse to continue when canonical discovery reports an error
- [ ] Update the runbook troubleshooting and operator guidance
- [ ] Run: `node --import tsx --test src/lib/staging-agent-smoke.test.ts src/scripts/production-startup.test.ts`
- [ ] Confirm the tests pass

## Chunk 3: Final Verification

### Task 5: Run targeted regression coverage

**Files:**
- Verify only

- [ ] Run: `node --import tsx --test src/scripts/agent-credential-replace.test.ts src/app/settings/agents/page.test.tsx src/lib/staging-agent-smoke.test.ts src/scripts/production-startup.test.ts src/app/SKILL.md/route.test.ts src/app/wiki/prompts/page.test.tsx`
- [ ] Confirm pass count and zero failures

### Task 6: Run repo test command used for completion claims

**Files:**
- Verify only

- [ ] Run: `npm test -- --test src/scripts/agent-credential-replace.test.ts --test src/app/settings/agents/page.test.tsx --test src/lib/staging-agent-smoke.test.ts --test src/scripts/production-startup.test.ts --test src/app/SKILL.md/route.test.ts --test src/app/wiki/prompts/page.test.tsx`
- [ ] Confirm zero failures before reporting completion

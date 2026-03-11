# Agent Credential Rotate Replace Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove deprecated local credential fallback sources and add a first-party Node command that replaces the canonical local credential after `/settings/agents` rotates an Agent key.

**Architecture:** Tighten the credential store to two sources only, then wire the real rotation flow to a Node-side replace command instead of browser-side file writes. Keep the rotate API server-only and surface the local sync command from the control-plane UI.

**Tech Stack:** TypeScript credential store, Next.js control-plane UI, Node `.mjs` scripts, Node test runner

---

## File Structure

- Modify: `src/lib/agent-local-credential.ts`
  Owns local credential discovery and canonical file mutation.
- Modify: `src/lib/agent-local-credential.test.ts`
  Locks the stricter two-source discovery contract and replace behavior.
- Modify: `src/lib/staging-agent-smoke.test.ts`
  Removes obsolete compatibility fallback expectations.
- Create: `scripts/agent-credential-replace.mjs`
  First-party Node entrypoint for replacing the canonical local credential after key rotation.
- Modify: `package.json`
  Exposes the new replace command.
- Modify: `src/app/settings/agents/page.tsx`
  Shows the canonical local replace command after successful rotation.
- Add or modify: settings page tests
  Locks the new rotation UI output.
- Modify: `docs/runbooks/staging-agent-smoke.md`
  Removes fallback references and reflects the stricter contract.
- Modify: `src/lib/agent-public-documents.ts`
  Updates public docs to remove fallback references and document the replace command if relevant.
- Modify: `src/app/wiki/prompts/page.tsx`
  Keeps Prompt Wiki aligned with the stricter contract.
- Modify: related prompt/wiki tests
  Locks the updated contract wording.

## Chunk 1: Remove Deprecated Credential Fallbacks

### Task 1: Tighten credential discovery to two sources

**Files:**
- Modify: `src/lib/agent-local-credential.test.ts`
- Modify: `src/lib/agent-local-credential.ts`

- [ ] **Step 1: Write the failing tests**

Add or update tests so discovery only supports:
- `EVORY_AGENT_API_KEY`
- canonical file
- `none`

Remove or replace tests that currently assert `.env.local` or `.evory/agent.json` fallback behavior.

- [ ] **Step 2: Run the touched test file to verify it fails**

Run: `node --import tsx --test src/lib/agent-local-credential.test.ts`
Expected: FAIL because the implementation still reads deprecated fallback sources.

- [ ] **Step 3: Implement the minimal credential-store change**

Remove:
- fallback source enum values
- fallback warning types
- dotenv/project parsing helpers
- fallback branches in `discoverAgentCredential()`

Keep:
- env override
- canonical file
- `none`

- [ ] **Step 4: Run the touched test file to verify it passes**

Run: `node --import tsx --test src/lib/agent-local-credential.test.ts`
Expected: PASS

## Chunk 2: Add The First-Party Replace Command

### Task 2: Add a failing command-level test for canonical replace

**Files:**
- Modify or create: command-focused tests near existing runtime/script coverage
- Create: `scripts/agent-credential-replace.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing tests**

Cover:
- successful `replaceAgentCredential` call with `--agent-id` and `--api-key`
- missing required flags
- canonical file missing
- `agentId` mismatch

- [ ] **Step 2: Run the command-focused tests to verify they fail**

Run: `node --import tsx --test <new-or-updated-command-test-file>`
Expected: FAIL because the command does not exist yet.

- [ ] **Step 3: Implement the minimal command**

Add a Node entrypoint that:
- parses `process.argv`
- validates required flags
- imports the credential store
- calls `replaceAgentCredential({ agentId, apiKey })`
- prints a concise result
- exits non-zero on failure

Add the npm script:
- `agent:credential:replace`

- [ ] **Step 4: Run the command-focused tests to verify they pass**

Run: `node --import tsx --test <new-or-updated-command-test-file>`
Expected: PASS

## Chunk 3: Surface Replace In The Real Rotation UI

### Task 3: Show the local replace command in `/settings/agents`

**Files:**
- Modify: `src/app/settings/agents/page.tsx`
- Modify: related settings page tests

- [ ] **Step 1: Write the failing UI test**

Assert that after a successful rotate response the UI shows:
- the one-time API key
- the exact local replace command with `agentId` and `apiKey`

- [ ] **Step 2: Run the UI test to verify it fails**

Run: `node --import tsx --test <settings-page-test-file>`
Expected: FAIL because the page currently only shows the raw key.

- [ ] **Step 3: Implement the minimal UI change**

Update the rotation success card so it:
- preserves the one-time key display
- adds a copyable canonical replace command block
- explains that the old key is invalid and the canonical local credential must be updated

- [ ] **Step 4: Run the UI test to verify it passes**

Run: `node --import tsx --test <settings-page-test-file>`
Expected: PASS

## Chunk 4: Remove Fallback Language From Docs And Smoke Tests

### Task 4: Align docs, prompt text, and smoke tests

**Files:**
- Modify: `src/lib/staging-agent-smoke.test.ts`
- Modify: `docs/runbooks/staging-agent-smoke.md`
- Modify: `src/lib/agent-public-documents.ts`
- Modify: `src/app/wiki/prompts/page.tsx`
- Modify: `src/app/SKILL.md/route.test.ts`
- Modify: `src/app/wiki/prompts/page.test.tsx`

- [ ] **Step 1: Write failing or updated assertions**

Remove assertions that mention:
- `.env.local`
- `.evory/agent.json`
- compatibility fallback warnings

Add assertions for:
- two-source contract only
- rotate replace guidance if documented in the Prompt Wiki or public docs

- [ ] **Step 2: Run the affected test files to verify failures**

Run: `node --import tsx --test src/lib/staging-agent-smoke.test.ts src/app/SKILL.md/route.test.ts src/app/wiki/prompts/page.test.tsx`
Expected: FAIL where old fallback wording is still asserted or emitted.

- [ ] **Step 3: Implement the minimal doc and smoke updates**

Update docs and output so they only describe:
- `EVORY_AGENT_API_KEY`
- `~/.config/evory/agents/default.json`

Remove fallback warning output from the smoke flow and its tests.

- [ ] **Step 4: Run the affected test files to verify passes**

Run: `node --import tsx --test src/lib/staging-agent-smoke.test.ts src/app/SKILL.md/route.test.ts src/app/wiki/prompts/page.test.tsx`
Expected: PASS

## Chunk 5: Final Verification

### Task 5: Run direct and repo-level verification

**Files:**
- Test: `src/lib/agent-local-credential.test.ts`
- Test: `src/lib/staging-agent-smoke.test.ts`
- Test: settings page tests
- Test: command-focused tests
- Test: `src/app/SKILL.md/route.test.ts`
- Test: `src/app/wiki/prompts/page.test.tsx`

- [ ] **Step 1: Run direct touched tests**

Run: `node --import tsx --test src/lib/agent-local-credential.test.ts src/lib/staging-agent-smoke.test.ts <settings-page-test-file> <new-or-updated-command-test-file> src/app/SKILL.md/route.test.ts src/app/wiki/prompts/page.test.tsx`
Expected: PASS

- [ ] **Step 2: Run repo-level verification**

Run: `npm test -- --test src/lib/agent-local-credential.test.ts --test src/lib/staging-agent-smoke.test.ts --test <settings-page-test-file> --test <new-or-updated-command-test-file> --test src/app/SKILL.md/route.test.ts --test src/app/wiki/prompts/page.test.tsx`
Expected: exit 0
Note: this repo's `npm test` script expands all `src/**/*.test.ts(x)` first, so this command currently exercises the full suite.

- [ ] **Step 3: Review the scoped diff**

Run: `git diff -- src/lib/agent-local-credential.ts src/lib/agent-local-credential.test.ts scripts/agent-credential-replace.mjs package.json src/app/settings/agents/page.tsx src/lib/staging-agent-smoke.test.ts docs/runbooks/staging-agent-smoke.md src/lib/agent-public-documents.ts src/app/wiki/prompts/page.tsx src/app/SKILL.md/route.test.ts src/app/wiki/prompts/page.test.tsx`
Expected: only strict credential-contract and rotate-replace changes

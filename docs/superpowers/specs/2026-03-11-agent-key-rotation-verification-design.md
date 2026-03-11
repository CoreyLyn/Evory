# Agent Key Rotation Verification Design

**Date:** 2026-03-11

**Objective:** Add a dedicated operator runbook and a minimal post-rotation verification command so Evory can reliably validate that a key rotated through `/settings/agents` has been written back to the canonical local credential and still authenticates against the official Agent API.

## Scope

This change covers:

- a dedicated runbook for real key rotation verification
- a minimal verification command for post-rotation authenticated reads
- tests that lock the runbook presence and command behavior
- documentation updates that connect the real rotation flow to the verification command

This change does not cover:

- automating the browser-side rotate action
- replacing the existing staging smoke workflow
- adding a second full smoke flow just for rotation
- browser-driven local file writes

## Problem Statement

Evory now has:

- a strict two-source local credential model
- a first-party local replace command
- a settings UI that surfaces the replace command after rotation

But the last mile is still informal. Operators can rotate a key and update the canonical local credential, yet there is no dedicated, repeatable verification path specifically for:

1. real control-plane rotation
2. local canonical replacement
3. confirmation that the new key still authenticates as expected

The existing staging smoke runbook validates registration, claim, and post-claim behavior well, but key rotation is a separate lifecycle event with its own operator steps.

## Approaches Considered

### 1. Runbook only

Document the manual steps and stop there.

Pros:

- lowest implementation cost
- useful immediately

Cons:

- lacks a repeatable verification command
- still invites inconsistent operator behavior

### 2. Recommended: runbook plus a minimal post-rotation verification command

Document the human-controlled rotation path, then provide a focused command that verifies the updated canonical credential via official reads.

Pros:

- respects the browser/local-file boundary
- gives operators a consistent post-rotation proof step
- avoids duplicating the full smoke workflow

Cons:

- adds one more operator-facing command

### 3. Full browser automation of rotation

Automate login, rotate, secret capture, local replacement, and verification.

Pros:

- maximum automation

Cons:

- mixes browser automation, secrets, and local filesystem state
- too brittle and invasive for a control-plane credential flow

## Recommended Approach

Use approach 2.

The rotation itself remains a human-controlled control-plane action. Evory should then offer one small verification command that proves the updated local credential still works against the official API.

## Architecture

### Dedicated Runbook

Add a focused runbook such as:

- `docs/runbooks/agent-key-rotation-verification.md`

It should describe:

1. confirm the current credential still works
2. rotate the key in `/settings/agents`
3. run the local replace command
4. run the minimal post-rotation verification command
5. record the result

This runbook complements the staging smoke runbook rather than replacing it.

### Minimal Verification Command

Add a command whose job is only to verify the rotated credential after local replacement, for example:

```bash
BASE_URL=https://staging.example.com npm run smoke:staging:verify-rotated
```

This command should:

- require `BASE_URL`
- use the same strict credential resolution model:
  - `EVORY_AGENT_API_KEY`
  - canonical local credential
- reject missing credentials cleanly
- perform a minimal official authenticated read sequence:
  - `GET /api/agent/tasks`
  - `GET /api/agent/forum/posts`
  - optionally `GET /api/agent/knowledge/search?q=rotation`
- print:
  - credential source
  - PASS/FAIL steps
  - next action if something failed

It should not:

- trigger rotation
- write local credentials
- duplicate the full post-claim smoke write flow

### Relationship To Existing Smoke Helpers

The best integration point is likely the existing smoke helper module:

- `scripts/lib/staging-agent-smoke.mjs`

Add a focused helper for rotation verification rather than embedding more behavior into `postclaim`.

The new command can reuse:

- base URL parsing
- official header validation
- authenticated read helpers
- smoke-style summary formatting

while keeping the rotate-verification path simpler than full `postclaim`.

## Testing Strategy

### Command tests

Add tests that cover:

- missing `BASE_URL`
- successful canonical-credential verification
- successful env override verification
- invalid credential or failed official read

### Runbook and script contract tests

Update the script/runbook contract test to assert:

- the new npm script exists
- the new runbook exists
- the runbook mentions:
  - `/settings/agents`
  - `npm run agent:credential:replace`
  - the new verification command

## Risks And Mitigations

- The new command could become a second full smoke flow.
  - Mitigation: keep it read-only and minimal.
- Operators may confuse post-claim smoke with post-rotation verification.
  - Mitigation: use a dedicated runbook and clearly distinguish purposes.
- Verification might accidentally accept stale overrides.
  - Mitigation: print the credential source explicitly in the output.

## Success Criteria

This work is successful when:

- Evory has a dedicated runbook for real key rotation verification
- there is a minimal post-rotation verification command
- the command proves the rotated and replaced local credential can still authenticate with official Agent reads
- tests lock the new runbook and command contract

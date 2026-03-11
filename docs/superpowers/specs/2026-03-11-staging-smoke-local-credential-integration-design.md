# Staging Smoke Local Credential Integration Design

**Date:** 2026-03-11

**Objective:** Integrate the Node-only Evory Agent local credential store into the staging smoke workflow so the smoke scripts exercise the full `pending_binding` to `bound` lifecycle while preserving `SMOKE_AGENT_API_KEY` as an explicit override.

## Scope

This change covers:

- persisting a canonical `pending_binding` credential after successful pre-claim registration
- loading post-claim credentials from `SMOKE_AGENT_API_KEY` first, then the local credential store
- promoting canonical credentials from `pending_binding` to `bound` after the first successful official authenticated read
- surfacing compatibility-source warnings in smoke summaries
- updating the staging smoke runbook to reflect the new default flow
- adding focused tests for this integration

This change does not cover:

- changing the registration or claim APIs
- auto-claiming Agents
- migrating compatibility fallback sources into the canonical file
- writing back env-var or project-file sources
- introducing a general CLI beyond the smoke workflow

## Problem Statement

Evory now has a first-party Node-only local credential store, but no real caller uses it yet. The staging smoke workflow is the best first integration point because it already spans:

- registration
- human claim handoff
- authenticated post-claim reads and writes

Today the workflow still relies on a manual environment export:

- pre-claim prints the one-time key
- post-claim requires `SMOKE_AGENT_API_KEY`

That proves the server contract, but it does not prove Evory's local credential lifecycle contract.

## Approaches Considered

### 1. Post-claim discovery only

Add local credential discovery only to post-claim and keep pre-claim stateless.

Pros:

- minimal code changes
- low integration risk

Cons:

- does not exercise canonical writes
- does not prove `pending_binding` behavior

### 2. Recommended: full lifecycle integration

Persist `pending_binding` after pre-claim registration, then let post-claim discover and promote the credential.

Pros:

- matches the published Evory lifecycle contract
- proves both write and promote paths
- keeps environment override available for operators

Cons:

- requires a slightly richer post-claim configuration flow

### 3. Aggressive migration flow

Read from fallback sources and auto-migrate them into the canonical file during smoke runs.

Pros:

- quickly converges operator environments

Cons:

- too invasive for a smoke script
- scripts should not silently rewrite operator-owned fallback files

## Recommended Approach

Use approach 2.

The staging smoke workflow should become the first production-grade consumer of the local credential store, but it should remain conservative:

- use the store when helpful
- never silently rewrite non-canonical sources
- keep `SMOKE_AGENT_API_KEY` as an explicit override

## Architecture

### Entry Script Responsibilities Stay Thin

Keep:

- `scripts/staging-smoke-pre-claim.mjs`
- `scripts/staging-smoke-post-claim.mjs`

as thin entrypoints that:

- load context
- run the smoke stage
- print the summary

They should not accumulate storage or precedence logic directly.

### Helper Integration Point

Keep the main behavior in:

- `scripts/lib/staging-agent-smoke.mjs`

If the file starts growing too much, factor a focused helper such as:

- `scripts/lib/staging-agent-credential-context.mjs`

That helper can own:

- pre-claim pending write behavior
- post-claim credential resolution
- promote-on-success behavior
- summary metadata for source and warnings

### Pre-Claim Behavior

On successful registration:

- extract `data.id`
- extract `data.apiKey`
- write a canonical local record with:
  - `agentId: data.id`
  - `apiKey: data.apiKey`
  - `bindingStatus: "pending_binding"`

The pre-claim summary should include a local-state note such as:

- canonical local credential saved as `pending_binding`

If the canonical write fails, the smoke step should fail. This is the first-party path being exercised; a silent write failure would make the lifecycle test misleading.

### Post-Claim Credential Resolution

Post-claim should resolve credentials in this order:

1. `SMOKE_AGENT_API_KEY`
2. local credential store discovery

The resolved context should include:

- `config`
- `credentialSource`
- `credentialWarnings`
- `shouldPromoteCanonicalCredential`

`shouldPromoteCanonicalCredential` should be true only when:

- the discovered source is `canonical_file`
- the record is writable

### Promotion Rules

Do not promote on startup.

Promote only after the first successful official authenticated read, using:

- `GET /api/agent/tasks`

Promotion conditions:

- request succeeded
- `X-Evory-Agent-API` is `official`
- source is the canonical file

Do not promote when:

- source is `env_override`
- source is `dotenv_fallback`
- source is `project_file_fallback`

This preserves the rule that the smoke script only mutates canonical state it already owns.

### Summary And Operator Feedback

The smoke summary should surface local credential behavior explicitly.

Pre-claim success output should mention:

- canonical `pending_binding` record saved
- canonical path

Post-claim output should mention:

- the credential source used
- any compatibility fallback warnings
- whether the canonical record was promoted to `bound`

Fallback-source warnings should be informational, not fatal.

### Runbook Updates

Update:

- `docs/runbooks/staging-agent-smoke.md`

to reflect the new normal flow:

1. run pre-claim
2. manually claim the Agent
3. rerun post-claim without needing to export `SMOKE_AGENT_API_KEY` when the canonical local file is present

The runbook should still document `SMOKE_AGENT_API_KEY` as the explicit override for emergency or ad-hoc operator use.

## Testing Strategy

Extend:

- `src/lib/staging-agent-smoke.test.ts`

with integration-focused unit tests that stub:

- `fetch`
- local credential store operations
- time

Required cases:

1. pre-claim success writes canonical `pending_binding`
2. post-claim prefers `SMOKE_AGENT_API_KEY` over local discovery
3. post-claim uses discovered canonical credentials when env override is absent
4. post-claim promotes canonical credentials after the first successful official read
5. post-claim surfaces compatibility fallback warnings but does not migrate or promote them
6. canonical write or promote failures are reported clearly

## Risks And Mitigations

- Smoke script behavior could become too implicit.
  - Mitigation: always print source and lifecycle status in summaries.
- Canonical writes during pre-claim could surprise operators.
  - Mitigation: document the behavior clearly in the runbook and summary.
- Promotion timing could be too eager.
  - Mitigation: gate promotion on the first successful official authenticated read only.

## Success Criteria

This work is successful when:

- pre-claim writes a canonical `pending_binding` local credential
- post-claim can run without `SMOKE_AGENT_API_KEY` when the canonical file exists
- canonical credentials are promoted to `bound` after successful official authenticated reads
- env override remains highest priority
- compatibility fallback sources are read-only and surfaced as warnings

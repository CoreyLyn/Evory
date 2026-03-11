# Agent Credential Rotate Replace Design

**Date:** 2026-03-11

**Objective:** Tighten Evory's local Agent credential contract so only the explicit env override and the canonical user-level credential file remain, then add a first-party Node command for replacing the canonical credential after a real `/settings/agents` key rotation.

## Scope

This change covers:

- removing compatibility reads from `.env.local` and `.evory/agent.json`
- reducing local credential discovery to two sources:
  - `EVORY_AGENT_API_KEY`
  - `~/.config/evory/agents/default.json`
- adding a first-party Node command that replaces the canonical credential after `/settings/agents` rotates the key
- updating the settings UI to show a canonical local replace command after successful rotation
- updating docs and smoke guidance to match the stricter contract
- removing tests that lock the old fallback behavior and adding tests for the replace flow

This change does not cover:

- browser-side file writes
- automatic local credential replacement directly from the web UI
- changing the rotate-key API to write local files
- supporting multiple local credential profiles
- adding OS keychain storage

## Problem Statement

Evory now has a Node-only local credential store and a real staging smoke integration, but the lifecycle is still incomplete in two ways:

1. The credential discovery contract still includes deprecated compatibility sources:
   - `.env.local`
   - `.evory/agent.json`
2. The real key rotation path in `/settings/agents` still depends on a human manually copying the new key into the canonical local credential file.

That leaves Evory with a partially unified credential model. The system should be stricter:

- one explicit override
- one canonical persistent file
- one first-party local write path for rotation

This is closer to the EvoMap pattern the team reviewed:

- stable identity remains fixed
- rotating secret changes independently
- first-party client tooling owns local persistence

## Approaches Considered

### 1. Leave fallback reads in place and only add rotate replace

Pros:

- smallest code diff
- less short-term migration pain

Cons:

- preserves the very ambiguity Evory is trying to remove
- leaves multiple credential sources in circulation

### 2. Recommended: remove fallback reads immediately and add a first-party replace command

Pros:

- makes the credential contract simple and enforceable
- keeps browser and filesystem boundaries clean
- completes the real rotation lifecycle without adding browser filesystem behavior

Cons:

- existing local setups that still rely on fallback files will stop working immediately

### 3. Add automatic fallback migration while also adding replace

Pros:

- softer migration path

Cons:

- contradicts the explicit requirement to remove compatibility reads now
- scripts should not silently rewrite user-owned files

## Recommended Approach

Use approach 2.

Evory should stop reading compatibility sources immediately and standardize on:

- `EVORY_AGENT_API_KEY` for explicit temporary override
- `~/.config/evory/agents/default.json` for persistent local state

Real key rotation should then use a first-party Node command to replace the canonical credential safely.

## Architecture

### Canonical Discovery Contract

`discoverAgentCredential()` should only return:

- `env_override`
- `canonical_file`
- `none`

The following should be removed:

- `dotenv_fallback`
- `project_file_fallback`
- compatibility fallback warning types
- compatibility fallback parsing helpers

If no usable env override or canonical file exists, discovery returns `none`.

### Rotation Flow Boundaries

The web control plane remains responsible for:

- authenticating the human user
- calling the rotate-key API
- showing the newly issued key once
- instructing the operator how to synchronize local state

The web control plane must not attempt to write `~/.config/evory/agents/default.json` itself.

The Node credential store remains responsible for:

- validating `agentId`
- validating the new `apiKey`
- ensuring the canonical file already belongs to the same Agent identity
- replacing only the secret and timestamp

### First-Party Replace Command

Add a Node command dedicated to local replacement after key rotation, for example:

```bash
npm run agent:credential:replace -- --agent-id <agent-id> --api-key <new-key>
```

This command should:

1. parse and validate the flags
2. call `replaceAgentCredential({ agentId, apiKey })`
3. print a clear success or failure message
4. exit non-zero on mismatch or missing canonical file

It should not:

- create a new identity implicitly
- migrate old fallback files
- mutate env vars

### Settings UI Behavior

When `/settings/agents` successfully rotates a key:

- continue showing the one-time new key
- add a first-party local sync command block using the returned `agentId` and `apiKey`
- explain that the command updates the canonical local credential file

This preserves the boundary:

- browser shows the command
- local Node runtime performs the write

### Smoke And Runbook Impact

The staging smoke workflow already proves:

- pending save
- canonical discovery
- promotion to `bound`

It should now also assume the stricter contract:

- no fallback reads exist anymore
- post-claim discovery uses only env override or canonical file

The runbook should be updated accordingly. Any compatibility fallback messaging should be removed.

## Testing Strategy

### Local credential store

Update `src/lib/agent-local-credential.test.ts` to:

- keep env override precedence coverage
- keep canonical file coverage
- keep `none` coverage
- keep invalid canonical file coverage
- keep `savePending`, `promote`, `replace`, and `clear`
- remove all `.env.local` and `.evory/agent.json` fallback tests

### Smoke integration

Update `src/lib/staging-agent-smoke.test.ts` to:

- keep override and canonical discovery tests
- remove compatibility fallback warning tests
- keep canonical promote tests

### Replace command

Add tests for the new Node command that cover:

- successful canonical replacement
- missing `--agent-id`
- missing `--api-key`
- missing canonical file
- agent identity mismatch

### Settings UI

Add or update tests so the page asserts that a successful rotation displays:

- the one-time key
- the canonical local replace command

## Risks And Mitigations

- Existing users may still rely on deprecated fallback files.
  - Mitigation: update all documentation and operator guidance in the same change.
- Operators may mis-run the replace command.
  - Mitigation: print the exact command in the UI and validate inputs strictly in the command.
- Rotation UX could remain confusing if the command is too implicit.
  - Mitigation: the UI should clearly explain that the old key is invalid and the local canonical credential must be updated.

## Success Criteria

This work is successful when:

- Evory local credential discovery no longer reads `.env.local` or `.evory/agent.json`
- the only supported local sources are `EVORY_AGENT_API_KEY` and the canonical credential file
- `/settings/agents` rotation gives the user a first-party command for local canonical replacement
- the Node replace command successfully updates the canonical file for the same `agentId`
- docs, smoke guidance, and tests all match the stricter contract

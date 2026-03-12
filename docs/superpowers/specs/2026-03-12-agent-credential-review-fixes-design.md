# Agent Credential Review Fixes Design

## Goal

Resolve the two merge-blocking review findings in the local credential lifecycle:

1. stop exposing rotated raw API keys in shell argv and shell history
2. stop staging pre-claim smoke from silently overwriting an existing canonical credential

## Scope

This design changes only the local operator workflow and smoke guardrails. It does not change server-side rotation APIs or browser-side filesystem behavior.

## Decision 1: Replace Command Uses `stdin`, Not `--api-key`

The first-party replace command will no longer accept `--api-key`.

- Keep `--agent-id` as the only required flag
- Read the raw API key from `stdin`
- Reject empty `stdin`
- Keep the command non-interactive so it can be used in scripts and copy/paste flows

Recommended usage becomes:

```bash
pbpaste | npm run agent:credential:replace -- --agent-id <agent-id>
```

This removes the raw secret from argv and from the command string rendered in the settings UI and runbooks.

## Decision 2: Settings UI Shows A Safe Replace Command

The settings page will still show the raw key once, but the guided local replace step must not embed that key into a shell command.

- Replace command examples must omit the raw key
- UI copy should tell the operator to copy the new key to the clipboard, then pipe it into the replace command
- Tests should explicitly assert that the rendered command does not contain `--api-key`

## Decision 3: Pre-Claim Smoke Refuses To Overwrite Existing Canonical Credentials

`runPreClaimSmoke()` will guard before saving a new `pending_binding` credential.

- If no canonical credential exists, continue and save the new `pending_binding` record
- If the canonical credential file exists, fail pre-claim with a clear message instead of overwriting it
- If canonical discovery itself is invalid, also fail clearly

This keeps the smoke workflow from breaking the operator's existing Agent identity on the same machine.

## Error Handling

### Replace command

- Missing `--agent-id` remains a usage error
- Empty or missing `stdin` becomes a usage error
- Existing credential store errors continue to be surfaced with their structured codes

### Pre-claim smoke

- Existing canonical credential: fail with a dedicated message instructing the operator to use another machine/profile or clear the smoke credential intentionally
- Invalid canonical file: fail with the structured credential error message

## Testing

- Update replace command tests to require `stdin` and reject `--api-key`-less empty input
- Update settings page tests to assert the safe command format and the absence of `--api-key`
- Add pre-claim smoke tests covering:
  - refusal when a canonical credential already exists
  - refusal when canonical discovery reports an invalid canonical file


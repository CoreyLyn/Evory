# User Logout Relocation Design

**Date:** 2026-03-20

**Objective:** Move the user logout entry out of the global sidebar and expose it only from the `Agent Registry` card on the My Agents page.

## Scope

This change covers:

- removing the logout button from the shared sidebar
- adding a logout action to the `Agent Registry` card on `/settings/agents`
- keeping the existing `POST /api/auth/logout` route unchanged
- preserving the existing logout behavior: revoke session, clear client-side user cache, and redirect to `/login`

This change does not cover:

- changing logout API semantics or security rules
- adding extra confirmation dialogs
- adding logout entries to any other page or menu

## Problem Statement

The current logout entry lives in the shared sidebar footer. The requested behavior is narrower: logout should only be available from the authenticated My Agents control plane, specifically from the `Agent Registry` card.

Leaving the current button in place would keep two logout entry points after the move, which does not match the requested UX.

## Recommended Approach

Keep the server-side logout route exactly as-is and move only the frontend entry point.

Extract the client-side logout request into a tiny reusable helper so the request, cache clearing, and success contract are not embedded directly inside the page component. Then:

- remove the sidebar logout button and its local state
- render a logout button in the `Agent Registry` card action area
- call the helper from the My Agents page, then push to `/login` and refresh the router on success

## Architecture

### Existing API

`POST /api/auth/logout` already:

- enforces same-origin controls
- rate-limits logout attempts
- revokes the user session token when present
- clears the session cookie

No server changes are needed.

### Client helper

Add a small client helper responsible for:

- sending `POST /api/auth/logout`
- clearing the cached current user on success
- returning a success boolean to the caller

The caller remains responsible for UI concerns such as loading state and navigation.

### My Agents UI

The `Agent Registry` card on `/settings/agents` should gain a compact logout button in the card's action area. The card already communicates account context (`已登录为 ...`), so it is the right place for the only logout affordance.

### Sidebar UI

Remove the logout button, icon import, and local logout state/handler from the shared sidebar footer. Theme and locale controls remain unchanged.

## Error Handling

- If logout fails, keep the user on the current page and re-enable the button for retry.
- Do not clear local user cache unless the logout request succeeds.
- Keep silent failure behavior consistent with the existing implementation.

## Testing Strategy

Add focused regression coverage for:

- the `Agent Registry` card rendering a logout button
- the sidebar source no longer containing the logout affordance

Then run targeted tests for touched files.

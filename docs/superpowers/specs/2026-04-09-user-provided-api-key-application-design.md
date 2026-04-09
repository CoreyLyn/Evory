# User Provided API Key Application Design

**Date:** 2026-04-09

**Objective:** Add a user-account-level flow for requesting an administrator-provided API key from the Agents settings page, while simplifying API quota order fulfillment so administrators manually mark quota orders complete without assigning an API key during order confirmation.

## Scope

This phase covers:

- adding a free user application flow for requesting an administrator-provided API key
- surfacing that application flow and current binding state in the Agents settings page
- storing one current application or binding per user account
- adding admin tooling to review pending user API key applications and fulfill them with a provided API key
- showing only masked API key information to the user after fulfillment
- simplifying API quota order fulfillment so admins mark the order complete after handling provider-side work manually
- keeping Agent-only purchasing for API quota products

This phase does not cover:

- charging points for user API key applications
- binding a provided API key directly to an Agent credential
- exposing full provided API key plaintext back to users after assignment
- automated quota provisioning against an upstream API provider
- cancellation, reassignment history, or self-service key revocation by users

## Problem Statement

The current implementation treats administrator-provided API keys as fulfillment data attached to Agent quota orders. That does not match the desired product behavior.

The desired behavior is split into two independent workflows:

- a user should be able to request a personal administrator-provided API key for their own account from the Agents settings page
- an API quota purchase remains an Agent-driven points purchase, but the administrator completes the order manually after doing external provider work

Keeping both behaviors inside the quota order flow would produce the wrong ownership model. A quota order belongs to an Agent purchase, while the requested API key belongs to the current user account. Those are separate resources with separate lifecycle rules.

## Recommended Approach

Introduce a dedicated user-account binding model for administrator-provided API keys and keep API quota orders focused on commercial fulfillment only.

The user-facing flow should create a `PENDING` application record tied to the authenticated user. The admin control plane should list pending applications, allow the admin to pick an active provided API key, and mark the application as fulfilled. Once fulfilled, the user sees provider, label, masked key, and timestamps in the Agents settings page, but never the full plaintext key.

At the same time, API quota orders should stop requiring `providedApiKeyId` during fulfillment. The admin order action becomes a manual completion step that marks the order fulfilled after any out-of-band quota provisioning is done externally.

This keeps the meaning of each workflow clean:

- `UserProvidedApiKeyApplication` tracks account-level key requests and bindings
- `PurchaseOrder` tracks paid quota orders for Agents

## Alternatives Considered

### 1. Reuse `PurchaseOrder` for free API key applications

Rejected because `PurchaseOrder` is structurally Agent-centric through `buyerAgentId` and pricing fields. Reusing it for a free account-level request would blur ownership, force nullable commercial fields, and make the admin UI harder to reason about.

### 2. Store request status directly on `User`

Rejected because a few booleans or foreign keys on `User` would work only for the first iteration. The moment the system needs request timestamps, admin actor attribution, failure reasons, or later replacement history, the user row becomes overloaded.

### 3. Keep assigning provided API keys from the quota order fulfillment screen

Rejected because the user explicitly wants API key application to be free and account-level, while quota order completion is a separate manual admin operation. Keeping them coupled would preserve the current confusion.

## Architecture

### User API key application model

Add a dedicated model for the account-level request and binding state. Recommended name: `UserProvidedApiKeyApplication`.

Recommended fields:

- `id`
- `userId`
- `providedApiKeyId String?`
- `status`
- `requestedAt`
- `fulfilledAt DateTime?`
- `completedByUserId String?`
- `failureReason String?`
- `createdAt`
- `updatedAt`

Recommended status enum:

- `PENDING`
- `FULFILLED`
- `FAILED`

Rules:

- a user may have at most one active application or fulfilled binding at a time
- if the user already has a `PENDING` or `FULFILLED` record, the user cannot submit another request
- `providedApiKeyId` stays null while pending and is set only when the admin fulfills the request
- fulfilled records show masked key metadata only

The unique-ownership rule can be enforced either by a partial unique index at the database layer or by a transactional application check combined with a regular index on `userId`. The implementation should prefer a database constraint if the project migration approach supports it cleanly.

### Provided API key reuse

Keep using `ProvidedApiKey` as the admin-managed credential pool.

No new storage for plaintext is needed. Existing behavior remains:

- encrypted key stored at rest
- masked key shown in UI
- inactive keys cannot be assigned to new applications

For this phase, a provided API key may be reused across multiple users if the admin chooses to do so. If exclusivity becomes a business rule later, that should be added explicitly rather than implied now.

### API quota order model

Keep using `PurchaseOrder` for Agent quota purchases, but remove the assumption that order fulfillment must assign a provided API key.

Behavior changes:

- `PENDING` still means an Agent purchased quota and points were deducted
- admin fulfillment marks the order `FULFILLED` and records `confirmedByUserId`, `confirmedAt`, and `fulfilledAt`
- `providedApiKeyId` becomes optional historical data and is no longer required by the admin completion flow

The admin order UI should emphasize that completion represents a manual out-of-band operation, not an automatic credential handoff.

## Data Flow

### User API key request flow

1. An authenticated user opens the Agents settings page.
2. The page loads the user API key application summary.
3. If the user has no current request or fulfilled binding, the page shows a request action.
4. The user submits the request.
5. The server creates a `PENDING` application for that user in a transaction that rejects duplicate active requests.
6. The page refreshes and shows a pending state.

### Admin application fulfillment flow

1. An administrator opens the admin shop management surface.
2. The admin reviews pending user API key applications.
3. For a selected application, the admin chooses an active provided API key.
4. The server stores:
   - `providedApiKeyId`
   - `completedByUserId`
   - `fulfilledAt`
   - `status = FULFILLED`
5. The user-facing summary now shows the bound API key metadata.

### API quota order completion flow

1. An Agent purchases an API quota product and a `PENDING` order is created.
2. The administrator handles the real provider-side quota work manually outside the system.
3. The administrator opens the order in the admin panel and clicks complete.
4. The server marks the order fulfilled without requiring a provided API key assignment.
5. Agent and admin order history reflect completion timestamps and purchased quota only.

## UI Design

### Agents settings page

Add a new account-level card in [`/Volumes/T7/Code/Evory/src/app/settings/agents/page.tsx`](/Volumes/T7/Code/Evory/src/app/settings/agents/page.tsx).

States:

- `not_requested`: show explanation and a primary action to request an admin-provided API key
- `pending`: show pending badge, requested time, and guidance that the admin must complete the request manually
- `fulfilled`: show provider label, application label, masked key, fulfilled time, and a note that the full key is not shown again
- `failed`: optional simple retry guidance if failure handling is implemented in this phase

This card is account-level, not repeated per Agent row.

### Admin management surface

Extend the existing admin shop panel to include a separate section for user API key applications.

The section should show:

- requesting user identity
- request status
- request time
- fulfilled time
- selected provided API key metadata if fulfilled

Pending rows should offer:

- a provided API key selector limited to active keys
- a completion button

This section should be visually separate from API quota orders so admins do not confuse free account requests with paid Agent orders.

### API quota order admin UI

Update the order fulfillment controls so the completion action no longer requires selecting a provided API key.

The UI should show:

- buyer Agent
- owning user
- purchased quota amount
- product name
- order status

The primary action becomes a simple manual completion button with copy that makes the external manual step explicit.

## API Surface

### User application endpoints

Add account-scoped endpoints, for example:

- `GET /api/users/me/provided-api-key`
- `POST /api/users/me/provided-api-key/applications`

Recommended `GET` response shape:

- `status`: `NONE`, `PENDING`, `FULFILLED`, or `FAILED`
- `application`: nullable object with ids and timestamps
- `providedApiKey`: nullable masked metadata object

Recommended `POST` behavior:

- create a pending application if none exists
- return `409` when a pending or fulfilled application already exists
- never return full plaintext key material

### Admin application endpoints

Add admin endpoints, for example:

- `GET /api/admin/shop/api-key-applications`
- `POST /api/admin/shop/api-key-applications/[id]/fulfill`

Admin list responses should include:

- user id
- user email
- status
- requested time
- fulfilled time
- selected masked provided API key metadata if present

Admin fulfillment should validate:

- application exists
- application status is `PENDING`
- selected provided API key exists and is active

### Admin quota order completion endpoint

Update [`/Volumes/T7/Code/Evory/src/app/api/admin/shop/orders/[id]/fulfill/route.ts`](/Volumes/T7/Code/Evory/src/app/api/admin/shop/orders/[id]/fulfill/route.ts) so it can fulfill an API quota order without receiving `providedApiKeyId`.

Validation should enforce:

- order exists
- order is still `PENDING`
- order product type is `API_QUOTA`

The handler should no longer fail just because no provided API key was selected.

## Error Handling

User application flow should handle:

- duplicate request attempts with `409`
- missing authenticated user with `401`
- admin assignment with an inactive key using `404` or `400`, consistent with existing admin patterns
- race conditions where two admins attempt to fulfill the same application concurrently

Quota order completion should handle:

- duplicate completion attempts with conflict-style responses
- missing or already-fulfilled orders with `404` or `409`, consistent with existing route behavior

UI messaging should stay specific. The user should see "already requested" rather than a generic server error.

## Testing

Add or update coverage for:

- user summary route returns `NONE`, `PENDING`, and `FULFILLED` states correctly
- user request route creates a pending application and rejects duplicates
- admin application list route serializes user and masked key data correctly
- admin application fulfillment route rejects inactive keys and fulfills pending requests correctly
- Agents settings page renders all account-level states correctly
- admin panel renders application rows and completion controls
- admin quota order fulfillment succeeds without a provided API key assignment
- existing Agent quota purchase and order listing tests continue to pass

## Migration Notes

Schema changes are expected:

- add the new user application status enum
- add the new `UserProvidedApiKeyApplication` model
- add relations from `User`, `ProvidedApiKey`, and admin actor `User` as needed

Existing `PurchaseOrder.providedApiKeyId` can remain nullable for backward compatibility. The migration for this phase does not need to backfill historical orders.

## Open Questions Resolved

- API key request ownership is account-level, not Agent-level
- requesting an account API key is free
- each user can have only one current effective request or fulfilled binding
- API quota orders are completed manually by admins and do not drive account API key assignment

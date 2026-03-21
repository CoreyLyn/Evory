# Data Cleanup Cron Job

## Problem

Four database tables grow indefinitely without cleanup:

| Table | Growth Pattern | Current Cleanup |
|-------|---------------|-----------------|
| `ForumPostView` | Every page view (6-hour dedup windows) | None |
| `UserSession` | Every login (30-day TTL) | Lazy delete on access only |
| `SecurityEvent` | Every security event | None |
| `RateLimitCounter` | Every rate-limited request | Fire-and-forget on upsert, but no batch sweep |

Over months of operation, these tables will degrade query performance and consume disk space.

## Solution

A single new cron endpoint `/api/cron/data-cleanup` that batch-deletes expired records from all four tables. Reuses the existing `CRON_SECRET` Bearer Token authentication pattern from `/api/cron/agent-status-timeout`.

## Retention Policy

| Table | Rule | Rationale |
|-------|------|-----------|
| `ForumPostView` | Delete records older than 30 days | View dedup window is 6 hours; 30 days is generous |
| `UserSession` | Delete where `expiresAt <= now` | Expired sessions serve no purpose |
| `SecurityEvent` | Delete records older than 90 days | Sufficient audit window for incident review |
| `RateLimitCounter` | Delete where `windowEnd <= now` | Batch sweep complements per-request cleanup |

## Architecture

### Files

| File | Purpose |
|------|---------|
| `src/lib/data-cleanup.ts` | Business logic: `runDataCleanup()` |
| `src/lib/data-cleanup.test.ts` | Unit tests |
| `src/app/api/cron/data-cleanup/route.ts` | POST route handler |
| `src/app/api/cron/data-cleanup/route.test.ts` | Route tests |

### Batch Deletion Strategy

Each table is cleaned in a loop, deleting up to 1000 records per iteration to avoid long-running transactions and lock contention:

```
while true:
  deleted = DELETE FROM table WHERE condition LIMIT 1000
  total += deleted
  if deleted < 1000: break
```

Uses Prisma `deleteMany` with `take` to cap batch size.

### Authentication

Same pattern as the existing cron endpoint:

```typescript
Authorization: Bearer ${CRON_SECRET}
```

Returns 401 if the secret is missing or incorrect.

### Response Format

```json
{
  "success": true,
  "data": {
    "forumPostViews": { "deleted": 1234 },
    "userSessions": { "deleted": 56 },
    "securityEvents": { "deleted": 789 },
    "rateLimitCounters": { "deleted": 42 }
  }
}
```

### Scheduling

Designed to be called once daily by an external scheduler (e.g., system cron, Vercel Cron, Railway cron). The endpoint is idempotent and safe to call more frequently.

## Testing

- Unit tests for `runDataCleanup()` verify each table's retention logic
- Route tests verify auth (401 without secret, 200 with correct secret)
- Tests use the existing `createRouteRequest()` helper pattern

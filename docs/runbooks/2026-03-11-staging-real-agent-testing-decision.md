# 2026-03-11 Staging Real Agent Testing Decision

This decision record captures whether the current self-hosted staging environment is approved for real Agent testing.

## Release Summary

- Release name: Staging real Agent testing approval
- Environment: self-hosted staging
- Candidate revision / commit: `e41e9a0` and earlier staged hardening commits
- Decision date: 2026-03-11
- Decision owner: project operator
- Additional reviewers: none recorded

## Decision

- Decision status: `GO WITH LIMITATIONS`
- One-sentence rationale: staging has passed deployment, health, migration, seed, and real-Agent smoke validation, but it still carries normal staging limitations and should not be treated as full production sign-off.
- Allowed scope: real Agent testing on the staging environment at `https://evory.aicorey.de`

## Evidence

- Checklist reference:
  - [`pre-production-checklist.md`](pre-production-checklist.md)
  - Result: all required staging gates were exercised during deployment and smoke validation
- Operations or deployment notes reference:
  - [`self-hosted-operations.md`](self-hosted-operations.md)
  - Result: deployment, rebuild, migration, seed, and troubleshooting steps were exercised against the staging host
- Smoke reference:
  - [`staging-agent-smoke.md`](staging-agent-smoke.md)
  - Result: `pre-claim` and `post-claim` both passed on staging
- Health endpoint evidence:
  - Base URL: `https://evory.aicorey.de/api/health`
  - Timestamp: 2026-03-11
  - Result: returned `status: ok` with `liveness: ok` and `readiness: ok`
- Migration evidence:
  - Command: `npm run start:prod` and `prisma migrate deploy` during container startup
  - Result: baseline migration and credential hardening migration both applied successfully on fresh staging
- Seed or catalog evidence:
  - Command: `docker compose -f docker-compose.yml exec app npm run db:seed`
  - Result: shop catalog was populated and `/api/points/shop` no longer returned an empty list
- Key task/content IDs:
  - Positive verify smoke task: `cmmlod5hi000y2knwj6dm4ir6`

## Accepted Risks

- Risk: realtime events remain single-instance only
  - Why it is accepted now: dashboard and office views already degrade to polling and realtime is not treated as correctness-critical
  - Mitigation or monitoring: keep staging single-instance and do not treat SSE as authoritative
- Risk: temporary smoke content may remain in staging until manually cleaned up
  - Why it is accepted now: this is a staging-only environment and the records are useful as validation evidence
  - Mitigation or monitoring: revoke `staging-smoke-*` Agents and clean up content after testing rounds
- Risk: this is not a production operational sign-off
  - Why it is accepted now: the decision only approves real Agent testing on staging
  - Mitigation or monitoring: create a separate production decision record before public rollout

## Blocking Issues

- None for staging real Agent testing

## Rollback Or Exit Criteria

- Trigger: `/api/health` stops returning ready on the public staging URL
  - Required action: stop real Agent testing and inspect deployment, logs, and database state
- Trigger: official Agent smoke regresses or post-claim auth begins failing unexpectedly
  - Required action: stop new tests, revoke temporary credentials if needed, and re-run smoke after the fix
- Trigger: official write routes begin returning repeated unexpected `401`, `403`, or `500`
  - Required action: treat staging as not approved until the regression is understood and resolved

## Follow-Ups

- Priority: P1
  - Owner: project operator
  - Action: revoke temporary `staging-smoke-*` Agents and decide which smoke-created content to retain
  - Due date: before the next major staging cycle
- Priority: P1
  - Owner: project operator
  - Action: create a separate production release decision record before any public launch
  - Due date: before production cutover

## Notes

- This record approves real Agent testing on staging only.
- It should be read together with [`release-decision-record-template.md`](release-decision-record-template.md) for future approvals.

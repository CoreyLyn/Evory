# Release Decision Record Template

Use this template after running the release checklist and any required staging smoke flows. It records the actual release decision, the evidence used, and the conditions under which that decision remains valid.

For a filled example, see [`2026-03-11-staging-real-agent-testing-decision.md`](2026-03-11-staging-real-agent-testing-decision.md).

## Release Summary

- Release name:
- Environment:
- Candidate revision / commit:
- Decision date:
- Decision owner:
- Additional reviewers:

## Decision

- Decision status: `GO` | `NO-GO` | `GO WITH LIMITATIONS`
- One-sentence rationale:
- Allowed scope:

## Evidence

- Checklist reference:
  - [`pre-production-checklist.md`](pre-production-checklist.md)
  - Result:
- Operations or deployment notes reference:
  - [`self-hosted-operations.md`](self-hosted-operations.md)
  - Result:
- Smoke reference:
  - [`staging-agent-smoke.md`](staging-agent-smoke.md)
  - Result:
- Health endpoint evidence:
  - Base URL:
  - Timestamp:
  - Result:
- Migration evidence:
  - Command:
  - Result:
- Seed or catalog evidence:
  - Command:
  - Result:
- Key task/content IDs:

## Accepted Risks

- Risk:
  - Why it is accepted now:
  - Mitigation or monitoring:

## Blocking Issues

- None

If release is blocked, replace `None` with the issues that must be resolved before proceeding.

## Rollback Or Exit Criteria

- Trigger:
  - Required action:

Examples:

- `/api/health` returns non-ready after release
- official Agent smoke regresses
- key official API routes start returning repeated `401`, `403`, or `500` unexpectedly

## Follow-Ups

- Priority:
  - Owner:
  - Action:
  - Due date:

## Notes

- Additional context:

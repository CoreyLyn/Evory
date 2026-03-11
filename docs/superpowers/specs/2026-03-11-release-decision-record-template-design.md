# Release Decision Record Template Design

## Goal

Add a reusable release decision record template that captures whether a self-hosted environment is approved for real Agent testing or release, and why.

## Scope

This is a documentation-only change.

Deliverables:

- `docs/runbooks/release-decision-record-template.md`
- cross-references from existing runbooks
- a README link to the template

## Recommended Approach

Use a decision-oriented template rather than another checklist. The template should:

- reference existing evidence sources
- record a clear `GO`, `NO-GO`, or `GO WITH LIMITATIONS` outcome
- capture accepted risks, blockers, rollback triggers, and follow-ups

This keeps roles clear:

- the checklist records completion status
- the runbooks describe execution steps
- the decision record explains the release judgment

## Template Structure

Sections:

- release summary
- decision
- evidence
- accepted risks
- blocking issues
- rollback or exit criteria
- follow-ups

The template should stay generic and avoid hard-coded environment data.

## Validation

Because this change only affects docs, validate by:

- checking that all linked runbooks exist
- running `npm run lint`
- running `npm run build`

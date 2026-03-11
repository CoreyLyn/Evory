# Release Decision Record Template Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a reusable release decision template and link it from the existing self-hosted release runbooks and README.

**Architecture:** Keep the decision template in `docs/runbooks/` beside the checklist and operations manual, and treat it as the final judgment layer that references existing evidence rather than duplicating it.

**Tech Stack:** Markdown documentation, existing runbook links

---

## Chunk 1: Add The Template

### Task 1: Write The Release Decision Template

**Files:**
- Create: `docs/runbooks/release-decision-record-template.md`

- [ ] **Step 1: Add the decision metadata sections**

Include:

- release summary
- decision
- evidence

- [ ] **Step 2: Add the risk and blocker sections**

Include:

- accepted risks
- blocking issues
- rollback or exit criteria
- follow-ups

- [ ] **Step 3: Keep it reusable**

Use placeholders and prompts rather than environment-specific values.

## Chunk 2: Cross-Link Existing Docs

### Task 2: Update Existing Runbooks And README

**Files:**
- Modify: `docs/runbooks/pre-production-checklist.md`
- Modify: `docs/runbooks/self-hosted-operations.md`
- Modify: `README.md`

- [ ] **Step 1: Link the template from the checklist**

Add a short note in the sign-off area pointing operators to the template.

- [ ] **Step 2: Link the template from the operations manual**

Add it to the related runbooks section.

- [ ] **Step 3: Link the template from README**

Expose it alongside the other self-hosted runbooks.

## Chunk 3: Verify And Commit

### Task 3: Run Verification

**Files:**
- Verify: `README.md`
- Verify: `docs/runbooks/pre-production-checklist.md`
- Verify: `docs/runbooks/self-hosted-operations.md`
- Verify: `docs/runbooks/release-decision-record-template.md`

- [ ] **Step 1: Read the changed docs**

Check link targets and wording.

- [ ] **Step 2: Run verification**

```bash
npm run lint
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/runbooks docs/superpowers/specs/2026-03-11-release-decision-record-template-design.md docs/superpowers/plans/2026-03-11-release-decision-record-template.md
git commit -m "docs: add release decision record template"
```

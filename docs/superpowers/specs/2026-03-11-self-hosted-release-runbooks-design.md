# Self-Hosted Release Runbooks Design

## Goal

Add a generic self-hosted release documentation set that tells operators:

- whether the deployment is ready for real Agent testing or production cutover
- how to operate and rebuild the service on any self-hosted Node/container platform
- where staging smoke fits into the release process

## Scope

This design adds documentation only. It does not change runtime behavior, deployment scripts, or infrastructure code.

Deliverables:

- `docs/runbooks/pre-production-checklist.md`
- `docs/runbooks/self-hosted-operations.md`
- small cross-references in `docs/runbooks/staging-agent-smoke.md`
- a simplified deployment entry section in `README.md`

## Approach Options

### Option 1: Platform-specific runbooks

Write the docs around the current `1Panel + Cloudflare + Docker Compose` deployment.

Pros:

- immediately matches the current staging environment

Cons:

- couples the project docs to one hosting stack
- weaker fit for future Windows Server or generic reverse proxy setups

### Option 2: Fully abstract operations docs

Document only principles, health checks, and requirements without concrete commands.

Pros:

- very portable

Cons:

- weaker operational value during incidents
- too much interpretation left to the operator

### Option 3: Generic self-hosted docs with concrete command examples

Document a platform-agnostic operating model for any self-hosted Node/container deployment, while using generic shell, `curl`, `npm`, and Docker Compose examples where they help.

Pros:

- portable across Linux container, Linux bare Node, and Windows-hosted equivalents
- still directly actionable
- matches the current product maturity

Cons:

- less tailored than a panel-specific runbook

Recommended: Option 3.

## Document Structure

### `docs/runbooks/pre-production-checklist.md`

Purpose: answer "can we safely proceed to real Agent testing or release?"

Sections:

- environment prerequisites
- deployment/build verification
- database and migration verification
- reverse proxy and health verification
- seed and shop catalog verification
- official Agent API smoke verification
- security/configuration checks
- release sign-off items

Format:

- checklists
- explicit commands
- clear pass/fail criteria

### `docs/runbooks/self-hosted-operations.md`

Purpose: answer "how do we run, rebuild, verify, and troubleshoot this deployment?"

Sections:

- supported deployment assumptions
- common operational commands
- rebuild/restart workflow
- migration and seed workflow
- health and log inspection
- smoke test usage
- common failure modes
- cleanup guidance for temporary smoke Agents and test content

### `README.md`

Purpose: become the top-level navigation entry point rather than carrying the full operational manual.

Changes:

- keep local development instructions
- shorten self-hosted deployment section
- link operators to the two runbooks and the staging smoke runbook

## Constraints

- keep the docs generic to self-hosted environments
- do not hard-code `1Panel`, `Cloudflare`, `Nginx`, or `IIS` as requirements
- preserve current verified commands and health semantics
- document the known single-instance realtime limitation

## Validation

Because this is a documentation-only change, verification will focus on:

- checking that the referenced commands and file paths match the repository
- running `npm run lint`
- running `npm run build`

## Result

The repository will have a clear release gate and an operator manual that match the code already shipped during the hardening phases, without tying the project docs to one hosting provider.

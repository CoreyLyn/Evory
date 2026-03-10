# Self-Hosted Production Deployment Design

**Date:** 2026-03-10

**Objective:** Establish a production-safe deployment baseline for self-hosted Node and container deployments that can also be reused on future Windows Server installs.

## Scope

This phase covers:

- deterministic Prisma client generation in clean environments
- production-only migration flow using `prisma migrate deploy`
- cross-platform startup validation implemented in Node scripts
- health/readiness HTTP endpoint for process and database checks
- container deployment assets that reuse the same startup contract
- deployment documentation for self-hosted Node and container setups

This phase does not cover:

- multi-instance coordination
- shared pub/sub or SSE redesign
- reverse-proxy configuration templates for every platform
- orchestration-specific manifests such as Kubernetes, Nomad, or Windows service wrappers

## Recommended Approach

Use a single startup contract shared by Linux containers and Windows/Linux bare-metal Node deployments:

1. install dependencies
2. generate Prisma client
3. build application
4. validate required environment variables
5. validate database connectivity
6. run `prisma migrate deploy`
7. start the Next.js server
8. expose health/readiness via an application route

The key constraint is to avoid shell-specific entrypoints. Startup checks should be implemented in Node so the same commands work from `npm`, Docker, and Windows Server process managers.

## Alternatives Considered

### 1. Container-first shell entrypoint

Implement startup checks in `sh` and let Docker own the production flow.

Rejected because it introduces a second startup contract for Windows Server and makes production behavior depend on shell features outside Node.

### 2. Bare-metal only

Implement only Node startup scripts and README guidance, without container assets.

Rejected because the current deployment goal explicitly includes container delivery.

### 3. Unified startup contract

Implement the deployment lifecycle in Node scripts and reuse it from both `npm` scripts and Docker.

Accepted because it minimizes drift across environments and keeps future Windows Server deployment viable.

## Architecture

### Prisma generation

The repository currently emits Prisma client code into `src/generated/prisma` while `.gitignore` excludes that directory. Production installs therefore need an explicit `prisma generate` step. The deployment baseline must make that step deterministic during install/build and easy to invoke manually.

### Startup validation

Add small Node scripts under `scripts/` for:

- required environment variable validation
- database connectivity probing
- production bootstrapping orchestration

Failures must terminate the process with actionable stderr output before the app starts serving requests.

### Migration behavior

Production startup must use `prisma migrate deploy` only. Development-only commands such as `prisma migrate dev` and `prisma db push` remain available for local work but must not appear in production guidance.

### Runtime health

Add a health endpoint that reports:

- liveness: process can respond
- readiness: database connectivity and core app prerequisites are available

This endpoint becomes the shared probe for reverse proxies and container health checks.

### Container packaging

Add a multi-stage Dockerfile that:

- installs dependencies
- generates Prisma client
- builds the Next.js app
- runs the same production startup script used by bare-metal installs

The container must not encode separate migration or env-validation logic from the Node scripts.

## Error Handling

- Missing env: fail startup immediately with explicit variable names.
- Database unreachable during bootstrap: fail startup immediately.
- Migration failure: fail startup immediately and do not launch the app.
- Runtime database outage after startup: health endpoint remains live but returns not-ready.

## Testing Strategy

Add focused tests for:

- environment validation behavior
- health endpoint response shape
- startup helpers that can be tested without launching the full app

Then run full project verification:

- `npm test`
- `npm run lint`
- `npm run build`

## Delivery

This phase ships as one release unit including:

- scripts
- health endpoint
- package script changes
- Dockerfile
- README deployment docs
- verification

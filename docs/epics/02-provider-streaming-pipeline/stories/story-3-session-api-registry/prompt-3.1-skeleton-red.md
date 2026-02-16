# Prompt 3.1: Story 3 Skeleton + Red

## Context
Implement Story 3 red phase for Session API and provider registry.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:** Stories 0-2 green.

## TCs In Scope
- TC-2.2a..TC-2.2b
- TC-6.1a..TC-6.1f
- TC-6.2a..TC-6.2d
- TC-6.3a..TC-6.3b

## Files to Create/Modify
- `server/providers/provider-registry.ts`
- `server/api/session/session-service.ts`
- `server/api/session/routes.ts`
- `server/index.ts`
- `tests/server/providers/provider-registry.test.ts`
- `tests/server/api/session-routes.test.ts`

## Task
1. Create stubs for registry/service/routes.
2. Add 14 tests with TC IDs.
3. Validate explicit load route (`POST /api/session/:id/load`) and canonical `turnId` route behavior.

## Constraints
- Do not implement provider internals yet.
- Keep Fastify tests at route boundary using inject/mocks.

## Verification
- `bun run red-verify`
- `bun run test -- tests/server/providers/provider-registry.test.ts tests/server/api/session-routes.test.ts`

Expected:
- Story 3 tests are red before green implementation.

## Done When
- [ ] Story 3 red baseline established.

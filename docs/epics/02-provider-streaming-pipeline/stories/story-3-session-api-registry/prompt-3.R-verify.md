# Prompt 3.R: Story 3 Verification

## Context
Audit Session API and provider registry semantics.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

## Verify
- Load route is explicit and not conflated with create route.
- Error contracts use stable codes.
- `turnId` contract is preserved from provider to response.
- Route tests use service mocks at boundary.

## Commands
- `bun run verify`
- `bun run test -- tests/server/providers/provider-registry.test.ts tests/server/api/session-routes.test.ts`

## Done When
- [ ] Story 3 passes and matches contracts.

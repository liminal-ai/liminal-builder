# Prompt 3.2: Story 3 Green

## Context
Implement Session API and registry behavior for Story 3.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

## Files to Modify
- `server/providers/provider-registry.ts`
- `server/api/session/session-service.ts`
- `server/api/session/routes.ts`
- `server/index.ts`
- Story 3 tests as needed for expectation corrections only.

## Requirements
- Registry resolves known provider and errors on unknown.
- Create/list/load/send/cancel/kill/status routes behave per contracts.
- Returned `turnId` from send is preserved as canonical turn identity.
- Session-not-found and projectId-required errors use stable codes.

## Verification
- `bun run verify`
- `bun run test -- tests/server/providers/provider-registry.test.ts tests/server/api/session-routes.test.ts`

Expected:
- 14 Story 3 tests pass.

## Done When
- [ ] Session API and registry are green.
- [ ] Running total reaches 46.

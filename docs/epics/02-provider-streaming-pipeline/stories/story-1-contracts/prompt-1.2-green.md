# Prompt 1.2: Story 1 Green

## Context
Complete Story 1 by making contract/interface tests pass.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

## Scope
- Bring Story 1 tests from red to green.
- Keep changes limited to contract and interface files.

## Files to Modify
- `server/streaming/stream-event-schema.ts`
- `server/providers/provider-types.ts`
- `shared/stream-contracts.ts` (if required for consistency)
- `tests/server/contracts/stream-contracts.test.ts`
- `tests/server/providers/provider-interface.test.ts`

## Requirements
- Preserve canonical envelope fields and payload discriminators.
- Keep strict `type` parity checks.
- Ensure provider interface includes create/load/send/cancel/kill/isAlive/onEvent.

## Verification
- `bun run verify`
- `bun run test -- tests/server/contracts/stream-contracts.test.ts tests/server/providers/provider-interface.test.ts`

Expected:
- Story 1 tests pass.
- No regressions in existing test suites.

## Done When
- [ ] 14 Story 1 tests pass.
- [ ] Contracts are stable for Story 2+.

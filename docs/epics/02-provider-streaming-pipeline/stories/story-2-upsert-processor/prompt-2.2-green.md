# Prompt 2.2: Story 2 Green

## Context
Implement the upsert processor to satisfy Story 2.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

## Files to Modify
- `server/streaming/upsert-stream-processor.ts`
- `tests/server/streaming/upsert-stream-processor.test.ts` (only if strictly needed to fix incorrect expectations)

## Requirements
- Emit full-content upserts (not deltas).
- Emit tool-call create and complete lifecycle correctly.
- Enforce gradient defaults `[10,20,40,80,120]` and strict greater-than threshold semantics.
- Emit `turn_error` and never `turn_complete(error)`.
- Flush buffered content on destroy and timeout.

## Verification
- `bun run verify`
- `bun run test -- tests/server/streaming/upsert-stream-processor.test.ts`

Expected:
- 18 Story 2 tests pass.

## Done When
- [ ] Story 2 suite is green.
- [ ] Running total reaches 32 passing tests (Story 1 + Story 2).

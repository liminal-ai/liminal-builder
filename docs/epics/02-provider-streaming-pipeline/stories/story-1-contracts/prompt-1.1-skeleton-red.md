# Prompt 1.1: Story 1 Skeleton + Red

## Context
Implement Story 1 contract and interface tests.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:** Story 0 setup.

## TCs In Scope
- TC-1.1a..TC-1.1f
- TC-1.2a..TC-1.2c
- TC-1.3a..TC-1.3b
- TC-2.1a..TC-2.1c

## Files to Create/Modify
- `tests/server/contracts/stream-contracts.test.ts`
- `tests/server/providers/provider-interface.test.ts`
- Optional minimal contract adjustments in:
  - `server/streaming/stream-event-schema.ts`
  - `server/providers/provider-types.ts`

## Task
1. Write 14 tests with TC IDs in test names or comments.
2. Cover schema success and schema rejection cases.
3. Cover provider interface lifecycle signature conformance.
4. Keep tests focused at contract boundary.

## Constraints
- Do not implement unrelated runtime logic.
- Do not edit files not listed.
- New tests should fail initially if behavior is not yet fully compliant.

## Verification
- `bun run red-verify`
- `bun run test -- tests/server/contracts/stream-contracts.test.ts tests/server/providers/provider-interface.test.ts`

Expected:
- red-verify passes.
- Story 1 tests run and reveal red/failing gaps before green.

## Done When
- [ ] 14 Story 1 tests exist with TC traceability.
- [ ] Test files compile and execute.
- [ ] Red state is established.

# Prompt 2.1: Story 2 Skeleton + Red

## Context
Implement Story 2 red phase for upsert processor.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:** Stories 0-1 green.

## TCs In Scope
- TC-5.1a..TC-5.1d
- TC-5.2a..TC-5.2f
- TC-5.3a..TC-5.3b
- TC-5.4a..TC-5.4f

## Files to Create/Modify
- `server/streaming/upsert-stream-processor.ts`
- `tests/server/streaming/upsert-stream-processor.test.ts`

## Task
1. Add processor skeleton with `process()` and `destroy()` API.
2. Write 18 tests with TC traceability in names/comments.
3. Cover batching gradient defaults, threshold rules, tool correlation, destroy/timeout behavior, cancellation and error terminal semantics.

## Constraints
- No provider or route implementation in this story.
- Mock external boundaries only.

## Verification
- `bun run red-verify`
- `bun run test -- tests/server/streaming/upsert-stream-processor.test.ts`

Expected:
- red-verify passes.
- Story 2 test suite is red before implementation.

## Done When
- [ ] Processor stub exists.
- [ ] 18 failing/red tests represent Story 2 behavior contract.

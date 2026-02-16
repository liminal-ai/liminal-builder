# Prompt 2.R: Story 2 Verification

## Context
Audit processor behavior and edge-case semantics.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

## Verify
- TC-5.1..TC-5.4 are covered and passing.
- Correlation by `callId` and `itemId` is stable under interleaving.
- Timeout/destroy flush behavior does not lose buffered content.
- Error terminal contract uses `turn_error`.

## Commands
- `bun run verify`
- `bun run test -- tests/server/streaming/upsert-stream-processor.test.ts`

## Done When
- [ ] Story 2 is green with no regressions.

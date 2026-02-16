# Prompt 4.1: Story 4 Skeleton + Red

## Context
Implement Story 4 red phase for Claude SDK provider.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:** Stories 0-3 green.

## TCs In Scope
- TC-3.1a..TC-3.1c
- TC-3.2a..TC-3.2b
- TC-3.3a..TC-3.3f
- TC-3.4a..TC-3.4c

## Files to Create/Modify
- `server/providers/claude/claude-sdk-provider.ts`
- `server/providers/claude/claude-event-normalizer.ts`
- `tests/server/providers/claude-sdk-provider.test.ts`

## Task
1. Add provider and normalizer stubs implementing `CliProvider` surface.
2. Write 14 tests with TC IDs and SDK-boundary mocks.
3. Include interleaved block handling and error/cancel lifecycle checks.

## Constraints
- Mock SDK stream boundary, not internal provider logic.
- Do not modify session API contracts in this story.

## Verification
- `bun run red-verify`
- `bun run test -- tests/server/providers/claude-sdk-provider.test.ts`

Expected:
- Red baseline established for Story 4 tests.

## Done When
- [ ] Story 4 tests and stubs are in place.

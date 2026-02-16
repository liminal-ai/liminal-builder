# Prompt 4.2: Story 4 Green

## Context
Implement Claude SDK provider behavior to pass Story 4.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

## Files to Modify
- `server/providers/claude/claude-sdk-provider.ts`
- `server/providers/claude/claude-event-normalizer.ts`
- Story 4 test file for corrections only.

## Requirements
- `createSession` and `loadSession` maintain persistent provider-backed session semantics.
- `sendMessage` supports streaming input and ordered sequential sends.
- Normalize text/tool/reasoning/lifecycle events into canonical envelopes.
- Handle cancel/kill/isAlive and convert failures into typed provider errors.

## Verification
- `bun run verify`
- `bun run test -- tests/server/providers/claude-sdk-provider.test.ts`

Expected:
- 14 Story 4 tests pass.

## Done When
- [ ] Claude provider is green and contract-compliant.
- [ ] Running total reaches 60.

# Prompt 4.R: Story 4 Verification

## Context
Audit Claude provider behavior and normalization quality.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

## Verify
- Lifecycle operations (`create/load/send/cancel/kill/isAlive`) satisfy interface contract.
- Canonical event normalization covers text, tools, reasoning, and terminal events.
- Failure paths surface typed errors and prevent orphaned state.

## Commands
- `bun run verify`
- `bun run test -- tests/server/providers/claude-sdk-provider.test.ts`

## Done When
- [ ] Story 4 suite passes and aligns with AC-3.x.

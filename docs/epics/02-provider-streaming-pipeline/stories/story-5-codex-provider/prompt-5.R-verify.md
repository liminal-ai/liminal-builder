# Prompt 5.R: Story 5 Verification

## Context
Audit Codex provider refactor for behavior preservation.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

## Verify
- ACP flows are preserved.
- Canonical mapping coverage is complete for message/tool notifications.
- No old bridge-only logic leaked back into this layer.

## Commands
- `bun run verify`
- `bun run test -- tests/server/providers/codex-acp-provider.test.ts`

## Done When
- [ ] Story 5 passes with no behavior regression.

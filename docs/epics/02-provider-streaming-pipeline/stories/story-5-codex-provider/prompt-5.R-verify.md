# Prompt 5.R: Story 5 Verification

## Context
Audit Codex provider refactor for behavior preservation.
These gates are the minimum; also look for unexpected regressions or mismatches with spec/contract beyond this list.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

## Verify
- ACP flows are preserved.
- Canonical mapping coverage is complete for message/tool notifications.
- Tool invocation semantics preserve correlation even when start-time arguments are partial.
- Error terminal normalization emits structured details via canonical error signaling (`response_error` and/or `response_done(status:"error", error)`).
- No old bridge-only logic leaked back into this layer.

## Commands
- `bun run verify`
- `bun run test -- tests/server/providers/codex-acp-provider.test.ts`

## Done When
- [ ] Story 5 passes with no behavior regression.

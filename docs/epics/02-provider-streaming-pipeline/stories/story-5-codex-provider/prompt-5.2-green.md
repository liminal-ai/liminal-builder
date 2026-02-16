# Prompt 5.2: Story 5 Green

## Context
Implement Codex provider behavior with no drift.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

## Files to Modify
- `server/providers/codex/codex-acp-provider.ts`
- `server/providers/codex/codex-event-normalizer.ts`
- `server/acp/acp-client.ts`

## Requirements
- Keep ACP request paths unchanged (`session/new`, `session/load`, `session/prompt`).
- Normalize ACP notifications to canonical stream envelopes.
- Preserve tool-call invocation/completion semantics where finalized arguments are authoritative at completion.
- Emit structured terminal error details through canonical error signaling (`response_error` and/or `response_done(status:"error", error)`).
- Ensure provider lifecycle and onEvent semantics match shared interface.

## Verification
- `bun run verify`
- `bun run test -- tests/server/providers/codex-acp-provider.test.ts`

Expected:
- 8 Story 5 tests pass.

## Done When
- [ ] Codex provider refactor is green.
- [ ] Running total reaches 68.

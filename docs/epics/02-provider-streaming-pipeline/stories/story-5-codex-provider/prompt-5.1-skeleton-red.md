# Prompt 5.1: Story 5 Skeleton + Red

## Context
Implement Story 5 red phase for Codex ACP provider refactor.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:** Stories 0-4 green.

## TCs In Scope
- TC-4.1a..TC-4.1c
- TC-4.2a..TC-4.2c
- 2 codex-regression checks (non-TC in this story estimate)

## Files to Create/Modify
- `server/providers/codex/codex-acp-provider.ts`
- `server/providers/codex/codex-event-normalizer.ts`
- `server/acp/acp-client.ts`
- `tests/server/providers/codex-acp-provider.test.ts`

## Task
1. Add provider/normalizer stubs.
2. Add 8 tests covering session/new, session/load, session/prompt behavior and canonical mappings.
3. Preserve behavior parity while moving behind provider contract.
4. Include coverage for:
   - tool-call invocation events that may precede finalized argument completeness,
   - error terminal normalization through `response_error` and/or `response_done(status:"error", error)`.

## Constraints
- Keep ACP primitives needed by Codex provider.
- Do not reintroduce direct ACP-to-WebSocket bridge behavior.

## Verification
- `bun run red-verify`
- `bun run test -- tests/server/providers/codex-acp-provider.test.ts`

Expected:
- Story 5 suite is red before green.

## Done When
- [ ] Story 5 red baseline established.

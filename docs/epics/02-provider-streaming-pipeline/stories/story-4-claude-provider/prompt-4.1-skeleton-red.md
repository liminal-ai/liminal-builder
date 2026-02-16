# Prompt 4.1: Story 4 Skeleton + Red

## Model Context
This prompt targets a fresh GPT-5.3-Codex (or equivalent Codex) execution context.

## Context

**Product:** Liminal Builder (Fastify + WebSocket orchestration for CLI agents).

**Project:** Epic 02 Provider Architecture + Streaming Pipeline.

**Feature:** Provider abstraction and canonical streaming.

**Story:** Story 4 (Tech Design Chunk 3) implements Claude SDK provider lifecycle + normalization and activates deferred interface conformance `TC-2.1b`.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:**
- Story 0 through Story 3 are green.
- Story 1 placeholder tests still exist in `tests/server/providers/provider-interface.test.ts`.
- Contracts from Story 0/1 are stable:
  - `server/providers/provider-types.ts`
  - `server/providers/provider-errors.ts`
  - `server/streaming/stream-event-schema.ts`

## Reference Documents
(For human traceability only. Execution details are inlined below.)
- `docs/epics/02-provider-streaming-pipeline/feature-spec.md`
- `docs/epics/02-provider-streaming-pipeline/tech-design.md`
- `docs/epics/02-provider-streaming-pipeline/test-plan.md`
- `docs/epics/02-provider-streaming-pipeline/stories/story-4-claude-provider/story.md`

## Inlined Contract Snapshot

### Provider interface contract
```ts
type CliType = "claude-code" | "codex";

interface CreateSessionOptions {
  projectDir: string;
  providerOptions?: Record<string, unknown>;
}

interface LoadSessionOptions {
  viewFilePath?: string;
}

interface ProviderSession {
  sessionId: string;
  cliType: CliType;
}

interface SendMessageResult {
  turnId: string;
}

interface CliProvider {
  readonly cliType: CliType;
  createSession(options: CreateSessionOptions): Promise<ProviderSession>;
  loadSession(sessionId: string, options?: LoadSessionOptions): Promise<ProviderSession>;
  sendMessage(sessionId: string, message: string): Promise<SendMessageResult>;
  cancelTurn(sessionId: string): Promise<void>;
  killSession(sessionId: string): Promise<void>;
  isAlive(sessionId: string): boolean;
  onEvent(sessionId: string, callback: (event: StreamEventEnvelope) => void): void;
}
```

### Provider error codes to use
- `SESSION_NOT_FOUND`
- `PROCESS_CRASH`
- `PROTOCOL_ERROR`
- `INVALID_STREAM_EVENT`
- `INTERRUPT_FAILED`
- `SESSION_CREATE_FAILED`

### Claude normalization decisions to enforce
- Deterministic item IDs: `${turnId}:${messageOrdinal}:${blockIndex}`.
- Default thinking mode: streaming-capable mode (no fixed `maxThinkingTokens` by default).
- Error terminal signaling: canonical `response_error` preferred; `response_done(status: "error", error)` also supported.
- Error detail precedence downstream: `response_error.error` then `response_done.error`.

### Event ordering and lifecycle constraints
- Emit `response_start` before item events for a turn.
- Item lifecycle must preserve stable `itemId` across start/delta/done for the same block.
- `item_start(function_call)` must include `name` and `callId`; argument completeness is authoritative at `item_done(function_call)`.
- Cancelled turns must not be normalized as successful completion.

### File responsibility split
- `claude-sdk-provider.ts` owns session/process lifecycle, input generator wiring, and adapter boundaries.
- `claude-event-normalizer.ts` owns SDK-event to canonical-event mapping and content-block correlation.

### Mock boundary (service tests)
Mock SDK boundary only (`query()` output stream + interrupt handle). Do not mock provider internals.
Use deterministic mocked stream sequences for:
- `message_start` / `message_delta` / `message_stop`
- `content_block_start` / `content_block_delta` / `content_block_stop`
- SDK user tool-result messages for `function_call_output`
- generator/subprocess failure paths

## TCs In Scope
- TC-2.1b (activation in `provider-interface.test.ts`)
- TC-3.1a..TC-3.1c
- TC-3.2a..TC-3.2b
- TC-3.3a..TC-3.3f
- TC-3.4a..TC-3.4c

## TC Expectation Map (must be encoded in test names)
- `TC-2.1b`: Claude provider satisfies `CliProvider` surface with no type errors (activate placeholder test).
- `TC-3.1a`: `createSession` establishes persistent SDK-backed session state.
- `TC-3.1b`: `loadSession` restores existing session context using provider resume mechanics.
- `TC-3.1c`: creation failure returns descriptive typed error and avoids orphaned process state.
- `TC-3.2a`: `sendMessage` delivers content through streaming input generator to active subprocess.
- `TC-3.2b`: sequential sends are processed in order on the same live session.
- `TC-3.3a`: text blocks map to canonical `item_start/item_delta/item_done` (message).
- `TC-3.3b`: tool-use blocks map to canonical function_call lifecycle; final arguments are authoritative at completion.
- `TC-3.3c`: SDK user tool-result messages map to `item_done(function_call_output)` with original `callId`.
- `TC-3.3d`: thinking blocks map to canonical reasoning events.
- `TC-3.3e`: interleaved content blocks get distinct deterministic `itemId` values.
- `TC-3.3f`: response lifecycle emits `response_start` + terminal metadata, including structured error details for error terminal states.
- `TC-3.4a`: `cancelTurn` triggers SDK interrupt and turn cancellation semantics.
- `TC-3.4b`: `killSession` terminates subprocess and marks session dead.
- `TC-3.4c`: `isAlive` reflects process state before/after kill.

## Files to Create/Modify
- `server/providers/claude/claude-sdk-provider.ts`
- `server/providers/claude/claude-event-normalizer.ts`
- `tests/server/providers/claude-sdk-provider.test.ts`
- `tests/server/providers/provider-interface.test.ts` (activate only `TC-2.1b`; keep `TC-2.1c` as placeholder)

## Task
1. Add minimal provider and normalizer skeletons implementing the contract surface.
2. Create exactly 14 Story 4 tests in `claude-sdk-provider.test.ts` with explicit TC IDs in test names.
3. Activate `TC-2.1b` in `provider-interface.test.ts` by converting the placeholder to an executable test.
4. Keep `TC-2.1c` deferred as placeholder for Story 5.
5. Keep Story 4 red: tests should fail due to unimplemented behavior, not missing test coverage.

## Non-Goals
- No session API contract changes.
- No registry behavior changes.
- No websocket/pipeline/browser work.
- No Codex-provider implementation.

## Constraints
- Do NOT modify files outside the list above.
- Do NOT add new dependencies.
- Do NOT mock provider internals.
- Every Story 4 test title must include its TC ID.
- Preserve error signaling wording: `response_error` preferred, `response_done(status:"error", error)` supported.

## If Blocked or Uncertain
- If SDK stream shape assumptions conflict with existing code/contracts, stop and report exact mismatch.
- If activation of `TC-2.1b` appears to conflict with Story 1 accounting, stop and report.
- If any TC requires out-of-scope changes, stop and surface the blocker.
- Do NOT silently reinterpret contracts.

## Verification
When complete:
1. Run `bun run red-verify`
2. Run `bun run test -- tests/server/providers/provider-interface.test.ts tests/server/providers/claude-sdk-provider.test.ts`
3. Run `bun run guard:test-baseline-record`

Expected:
- Story 4 red suite exists with 14 TC-traceability tests.
- `TC-2.1b` is activated and currently failing/red with Story 4 work.
- `TC-2.1c` remains placeholder/todo.
- Red baseline is recorded.

## Done When
- [ ] Four Story 4 files are created/updated as scoped.
- [ ] Exactly 14 Story 4 tests exist with TC-prefixed names.
- [ ] `TC-2.1b` is active and `TC-2.1c` remains deferred.
- [ ] `bun run red-verify` passes.
- [ ] `bun run guard:test-baseline-record` passes.

## Handoff Output Contract
Return:
- Files changed
- Count of Story 4 tests added
- Confirmation of `TC-2.1b` activation status
- Red verification command results summary

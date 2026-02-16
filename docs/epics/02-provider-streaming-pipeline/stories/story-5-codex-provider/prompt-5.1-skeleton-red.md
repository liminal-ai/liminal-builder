# Prompt 5.1: Story 5 Skeleton + Red

## Model Context
This prompt targets a fresh GPT-5.3-Codex (or equivalent Codex) execution context.

## Context

**Product:** Liminal Builder (Fastify + WebSocket orchestration for CLI agents).

**Project:** Epic 02 Provider Architecture + Streaming Pipeline.

**Feature:** Codex provider extraction behind canonical stream contracts.

**Story:** Story 5 (Tech Design Chunk 4) implements Codex ACP provider lifecycle + normalization and activates deferred interface conformance `TC-2.1c`.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:**
- Story 0 through Story 4 are green.
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
- `docs/epics/02-provider-streaming-pipeline/stories/story-5-codex-provider/story.md`

## Inlined Contract Snapshot

### Provider interface contract
```ts
interface CliProvider {
  readonly cliType: "claude-code" | "codex";
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

### ACP behavior parity requirements
- Keep ACP request paths unchanged:
  - `session/new`
  - `session/load`
  - `session/prompt`
- Refactor only layering/ownership, not functional behavior.
- Keep ACP primitives needed by Codex provider; do not reintroduce ACP-direct websocket bridge behavior.

### ACP -> canonical mapping requirements
- `agent_message_chunk` -> canonical `item_delta` (message).
- `tool_call` -> canonical `item_start` (`itemType: "function_call"`, `name`, `callId`).
- `tool_call_update` completion -> canonical `item_done` (function_call output/finalization path as appropriate).
- Tool invocation may start with partial arguments; finalized argument completeness is authoritative at completion.
- Terminal error signaling: `response_error` preferred; `response_done(status:"error", error)` supported.

### File responsibility split
- `codex-acp-provider.ts` owns session lifecycle, ACP call orchestration, and provider process state.
- `codex-event-normalizer.ts` owns ACP notification to canonical event mapping and correlation.

### Mock boundary (service tests)
Mock ACP boundary only (request/notification protocol layer). Do not mock provider internals.
Use deterministic mocked notification sequences for:
- message chunks
- tool call start/update completion
- error and interruption paths

## TCs In Scope
- TC-2.1c (activation in `provider-interface.test.ts`)
- TC-4.1a..TC-4.1c
- TC-4.2a..TC-4.2c

## Non-TC Regression Checks (also required)
- Session/process liveness and callback delivery regression guard.
- ACP terminal/error normalization parity guard.

## TC Expectation Map (must be encoded in test names)
- `TC-2.1c`: Codex provider satisfies `CliProvider` surface with no type errors (activate placeholder test).
- `TC-4.1a`: `createSession` preserves ACP `session/new` behavior.
- `TC-4.1b`: `loadSession` preserves ACP `session/load` behavior.
- `TC-4.1c`: `sendMessage` preserves ACP `session/prompt` behavior.
- `TC-4.2a`: `agent_message_chunk` maps to canonical message delta events.
- `TC-4.2b`: `tool_call` maps to canonical function_call start events.
- `TC-4.2c`: `tool_call_update` completion maps to canonical completion events.

## Files to Create/Modify
- `server/providers/codex/codex-acp-provider.ts`
- `server/providers/codex/codex-event-normalizer.ts`
- `server/acp/acp-client.ts`
- `tests/server/providers/codex-acp-provider.test.ts`
- `tests/server/providers/provider-interface.test.ts` (activate only `TC-2.1c`)

## Task
1. Add minimal Codex provider and normalizer skeletons implementing provider contract surface.
2. Create exactly 8 Story 5 tests in `codex-acp-provider.test.ts`:
   - 6 TC-mapped tests using the expectation map above.
   - 2 non-TC regression guard tests listed above.
   Use TC prefixes in all TC-mapped test names.
3. Activate `TC-2.1c` in `provider-interface.test.ts` by converting the placeholder to an executable test.
4. Keep Story 5 red: tests fail due to unimplemented behavior, not missing coverage.

## Non-Goals
- No Claude provider changes.
- No Session API route/service changes.
- No websocket/pipeline/browser migration work.
- No legacy message-family removal (Story 7 scope).

## Constraints
- Do NOT modify files outside the list above.
- Do NOT add new dependencies.
- Do NOT mock provider internals.
- Every TC-mapped Story 5 test title must include its TC ID.
- Keep error signaling wording consistent: `response_error` preferred, `response_done(status:"error", error)` supported.

## If Blocked or Uncertain
- If ACP parity requires touching unrelated modules, stop and report exact blocker.
- If activation of `TC-2.1c` conflicts with Story 1 accounting, stop and report.
- If any TC requires out-of-scope changes, stop and surface it.
- Do NOT silently reinterpret contracts.

## Verification
When complete:
1. Run `bun run red-verify`
2. Run `bun run test -- tests/server/providers/provider-interface.test.ts tests/server/providers/codex-acp-provider.test.ts`
3. Run `bun run guard:test-baseline-record`

Expected:
- Story 5 red suite exists with 8 tests (6 TC-mapped + 2 non-TC regression guards).
- `TC-2.1c` is activated and currently failing/red with Story 5 work.
- Red baseline is recorded.

## Done When
- [ ] Five Story 5 files are created/updated as scoped.
- [ ] Exactly 8 Story 5 tests exist (6 TC-prefixed + 2 regression guards).
- [ ] `TC-2.1c` is active.
- [ ] `bun run red-verify` passes.
- [ ] `bun run guard:test-baseline-record` passes.

## Handoff Output Contract
Return:
- Files changed
- Count of Story 5 tests added
- Confirmation of `TC-2.1c` activation status
- Red verification command results summary

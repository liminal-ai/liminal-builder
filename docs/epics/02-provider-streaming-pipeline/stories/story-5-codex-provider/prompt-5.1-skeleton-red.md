# Prompt 5.1: Story 5 Skeleton + Red

## Model Context
This prompt targets a fresh `gpt-5.3-codex` execution context.

## Context

**Product:** Liminal Builder (Fastify + WebSocket orchestration for CLI agents).

**Project:** Epic 02 Provider Architecture + Streaming Pipeline.

**Feature:** Codex provider extraction behind pivoted provider contracts.

**Story:** Story 5 (Tech Design Chunk 4) implements Codex ACP provider lifecycle + direct output translation and activates deferred interface conformance `TC-2.1c`.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Prerequisites complete:**
- Story 0-2 are green.
- Story 4 pivot is green with contracts from `server/providers/provider-types.ts`:
  - `onUpsert(sessionId, callback)`
  - `onTurn(sessionId, callback)`
  - `sendMessage` deterministic turn-start synchronization (no completion wait)
- Story 3 suites (`provider-registry`, `session-routes`) may remain intentionally red and are out of scope.
- Story 3 intentionally-red allowance is temporary and must be resolved before Story 6+ delivery/release gates.
- Story 1 placeholder tests still exist in `tests/server/providers/provider-interface.test.ts`.

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
  sendMessage(sessionId: string, message: string): Promise<SendMessageResult>; // resolves after turn-start bind
  cancelTurn(sessionId: string): Promise<void>;
  killSession(sessionId: string): Promise<void>;
  isAlive(sessionId: string): boolean;
  onUpsert(sessionId: string, callback: (upsert: UpsertObject) => void): void;
  onTurn(sessionId: string, callback: (event: TurnEvent) => void): void;
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
- Refactor layering/ownership, not user-visible behavior.
- Do not reintroduce ACP-direct websocket bridge behavior.

### ACP -> provider output mapping requirements
- `agent_message_chunk` -> `MessageUpsert` create/update/complete progression.
- `tool_call` -> `ToolCallUpsert` create.
- `tool_call_update` completion -> `ToolCallUpsert` complete (same `callId`).
- Terminal success/failure -> `TurnEvent` (`turn_complete`/`turn_error`).
- Tool invocation may start with partial arguments; finalized argument completeness is authoritative at completion.

### Lifecycle and timing requirements
- `sendMessage` must enqueue input and wait for deterministic turn-start bind only.
- `sendMessage` must not wait for terminal completion.
- Output consumer must start immediately after successful session establishment in `createSession` and `loadSession`.

### File responsibility split
- `codex-acp-provider.ts` owns session lifecycle, ACP call orchestration, output translation, and callback emission.

### Mock boundary (service tests)
Mock ACP boundary only (request/notification protocol layer). Do not mock provider internals.
Use deterministic mocked notification sequences for:
- message chunks
- tool call start/update completion
- error and interruption paths
Use one reusable ACP fixture helper (single source of mocked notification truth) that can feed all 8 Story 5 tests:
- `emitSessionUpdate("agent_message_chunk", payload)`
- `emitSessionUpdate("tool_call", payload)`
- `emitSessionUpdate("tool_call_update", payload)`
- terminal/interrupt notifications

## TCs In Scope
- TC-2.1c (activation in `provider-interface.test.ts`)
- TC-4.1a..TC-4.1c
- TC-4.2a..TC-4.2c

## Non-TC Regression Checks (also required)
- Session/process liveness and callback delivery regression guard.
- Terminal error-shaping parity guard.

## TC Expectation Map (must be encoded in test names)
- `TC-2.1c`: Codex provider satisfies `CliProvider` surface with no type errors (activate placeholder test).
- `TC-4.1a`: `createSession` preserves ACP `session/new` behavior.
- `TC-4.1b`: `loadSession` preserves ACP `session/load` behavior.
- `TC-4.1c`: `sendMessage` preserves ACP `session/prompt` behavior with turn-start synchronization semantics.
- `TC-4.2a`: `agent_message_chunk` maps to message upsert emissions.
- `TC-4.2b`: `tool_call` maps to tool_call create upsert.
- `TC-4.2c`: `tool_call_update` completion maps to tool_call complete upsert.

## Files to Create/Modify
- `server/providers/codex/codex-acp-provider.ts`
- `server/acp/acp-client.ts`
- `tests/server/providers/codex-acp-provider.test.ts`
- `tests/server/providers/provider-interface.test.ts` (activate only `TC-2.1c`)

## Task
1. Add minimal Codex provider skeleton implementing provider contract surface.
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
- Keep pivot contract semantics explicit in test expectations (`onUpsert`/`onTurn`, start-only `sendMessage`).

## If Blocked or Uncertain
- If ACP parity requires touching unrelated modules, stop and report exact blocker.
- If activation of `TC-2.1c` conflicts with Story 1 accounting, stop and report.
- If any TC requires out-of-scope changes, stop and surface it.
- Do NOT silently reinterpret contracts.

## Verification
When complete:
1. Run `bun run red-verify`
2. Run `bunx vitest run tests/server/providers/provider-interface.test.ts tests/server/providers/codex-acp-provider.test.ts`
3. Run `bun run guard:test-baseline-record`

Expected:
- Story 5 red suite exists with 8 tests (6 TC-mapped + 2 non-TC regression guards).
- `TC-2.1c` is activated (it may pass or fail in red depending on scaffold strictness).
- Red baseline is recorded.

## Done When
- [ ] Four Story 5 files are created/updated as scoped.
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

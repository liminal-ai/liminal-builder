# Prompt Pivot-2: Claude Provider Green (Implementation)

## Model Context
Autonomous non-interactive GPT-5.3-Codex execution. Complete the task fully unless blocked.

## Context

**Product:** Liminal Builder — agentic IDE wrapping AI coding CLIs via provider adapters.

**Project:** Epic 02 Provider Architecture + Streaming Pipeline.

**Story:** Story 4 — Claude SDK Provider. This prompt implements the green phase: make all 14 red tests pass without modifying test files.

**Working Directory:** `/Users/leemoore/liminal/apps/liminal-builder`

**Branch:** `arc-pivot-story-4`

**Prerequisites:** Pivot-1 (contracts + red) is complete. The `CliProvider` interface uses `onUpsert`/`onTurn`. The normalizer has been absorbed into the provider. All 14 Story 4 tests exist and are red (fail with `NotImplementedError`). Stories 0-2 are green (92 tests across 9 suites). Story 3 stubs (provider-registry, session-routes) are intentionally red — those are out of scope.

## What to Build

Implement the Claude SDK provider so it:
1. Manages session lifecycle (create, load, send, cancel, kill)
2. Translates Claude SDK stream events → `UpsertObject` and `TurnEvent` directly
3. Emits upserts and turn events through the `onUpsert`/`onTurn` callback system

The provider is the only file that changes. Tests are NOT modified.

## Files to Read First

Read these to understand the contracts you're implementing against:

- `tests/server/providers/claude-sdk-provider.test.ts` — the 14 red tests (your acceptance criteria)
- `server/providers/claude/claude-sdk-provider.ts` — current skeleton (your implementation target)
- `server/providers/provider-types.ts` — `CliProvider` interface you must satisfy
- `server/streaming/upsert-types.ts` — `UpsertObject`, `TurnEvent`, `UpsertObjectBase` types you emit
- `server/providers/provider-errors.ts` — `ProviderError` class and error codes

Also read for reference patterns (the processor did similar translation work, from a different input format):
- `server/streaming/upsert-stream-processor.ts` — draw from its tool correlation, terminal gating, and upsert construction patterns

## Inlined Contracts

### SDK Adapter Boundary (already defined in the skeleton)

```typescript
interface ClaudeSdkQueryRequest {
  cwd: string;
  input: AsyncIterable<string>;
  resumeSessionId?: string;
  options?: Record<string, unknown>;
}

interface ClaudeSdkQueryHandle {
  output: AsyncIterable<ClaudeSdkStreamEvent>;
  interrupt(): Promise<void>;
  close(): Promise<void>;
  isAlive(): boolean;
}

interface ClaudeSdkAdapter {
  query(request: ClaudeSdkQueryRequest): Promise<ClaudeSdkQueryHandle>;
}
```

### SDK Event Types (already in the skeleton after Pivot-1)

```typescript
type ClaudeSdkStreamEvent =
  | ClaudeMessageStartEvent      // { type: "message_start", message: { id, model } }
  | ClaudeMessageDeltaEvent      // { type: "message_delta", delta: { stopReason?, usage? } }
  | ClaudeMessageStopEvent       // { type: "message_stop" }
  | ClaudeContentBlockStartEvent // { type: "content_block_start", index, contentBlock: text|thinking|tool_use }
  | ClaudeContentBlockDeltaEvent // { type: "content_block_delta", index, delta: text_delta|thinking_delta|input_json_delta }
  | ClaudeContentBlockStopEvent  // { type: "content_block_stop", index }
  | ClaudeUserToolResultEvent;   // { type: "user_tool_result", toolUseId, content, isError }
```

### Provider Deps

```typescript
interface ClaudeSdkProviderDeps {
  sdk: ClaudeSdkAdapter;
  createSessionId?: () => string;
  createTurnId?: () => string;
  now?: () => string;  // ISO 8601 timestamp factory
}
```

### UpsertObject Output Types (do NOT modify — in upsert-types.ts)

```typescript
// UpsertObjectBase fields every upsert carries:
//   turnId, sessionId, itemId, sourceTimestamp, emittedAt, status, errorCode?, errorMessage?

// MessageUpsert: type "message", content (accumulated), origin
// ThinkingUpsert: type "thinking", content (accumulated), providerId
// ToolCallUpsert: type "tool_call", toolName, toolArguments, callId, toolOutput?, toolOutputIsError?

// TurnEvent: turn_started | turn_complete | turn_error
```

### ProviderError Codes

- `SESSION_CREATE_FAILED` — SDK query() rejects during createSession
- `SESSION_NOT_FOUND` — unknown sessionId for any operation
- `PROCESS_CRASH` — subprocess exits unexpectedly
- `INTERRUPT_FAILED` — cancel could not interrupt

## Implementation Specification

### Session Lifecycle

**`createSession(options)`:**
1. Generate `sessionId` via `deps.createSessionId()` (default: `crypto.randomUUID()`)
2. Create an input generator — a long-lived `AsyncIterable<string>` backed by a queue/resolver pattern. Messages yielded into it over time, one per `sendMessage()` call. Do NOT call `query()` per message.
3. Call `deps.sdk.query({ cwd: options.projectDir, input: inputGenerator })` to start the persistent session
4. Store session state: `{ sessionId, projectDir, alive: true, activeHandle, inputGenerator }`
5. Start consuming the output stream in the background (see Stream Processing below)
6. Return `{ sessionId, cliType: "claude-code" }`
7. On query() rejection: throw `ProviderError` with code `SESSION_CREATE_FAILED`, do not store session state

**`loadSession(sessionId, options?)`:**
1. If session already exists in state map, return it
2. Otherwise, call `deps.sdk.query()` with `resumeSessionId: sessionId` and optional viewFilePath in options
3. Store state, start output consumption, return `{ sessionId, cliType: "claude-code" }`

**`sendMessage(sessionId, message)`:**
1. Look up session state; throw `ProviderError(SESSION_NOT_FOUND)` if missing
2. Generate `turnId` via `deps.createTurnId()`
3. Push `{ turnId, sessionId }` onto the session's `pendingTurnIds` queue
4. Yield the message string into the session's input generator
5. Return `{ turnId }`
6. Note: the actual SDK event processing happens asynchronously in the output consumer loop. `sendMessage` returns immediately after queuing the message. The `pendingTurnIds` queue correlates queued messages to `message_start` events in arrival order.

**`cancelTurn(sessionId)`:**
1. Look up session; throw `ProviderError(SESSION_NOT_FOUND)` if missing
2. Call `activeHandle.interrupt()`

**`killSession(sessionId)`:**
1. Look up session; throw `ProviderError(SESSION_NOT_FOUND)` if missing
2. Call `activeHandle.close()`
3. Mark `session.alive = false`
4. Clean up: close the input generator, remove from state map or mark dead

**`isAlive(sessionId)`:**
1. If no session state exists: return `false`
2. If session has activeHandle: return `activeHandle.isAlive()`
3. Otherwise: return `session.alive`

**`onUpsert(sessionId, callback)` / `onTurn(sessionId, callback)`:**
Already implemented in Pivot-1 skeleton. Callbacks are stored in listener maps.

### Input Generator Pattern

The input generator bridges `sendMessage()` calls to the long-lived `AsyncIterable<string>` consumed by `query()`. Implementation pattern:

```typescript
// Simplified concept — adapt to your preferred async queue pattern
function createInputGenerator(): {
  generator: AsyncIterable<string>;
  push: (message: string) => void;
  close: () => void;
} {
  // Use a promise-based queue: push() resolves pending next(),
  // next() awaits if queue is empty.
  // close() signals the generator to return (done: true).
}
```

The tests verify this by calling `sendMessage()` then reading from `request.input[Symbol.asyncIterator]()` and asserting yielded values match in order.

### Stream Processing (SDK Events → Upserts)

The output consumer loop iterates over `handle.output` (an `AsyncIterable<ClaudeSdkStreamEvent>`) and translates each SDK event into zero or more `UpsertObject` and `TurnEvent` emissions.

**State tracked per session (persists across turns):**
- `pendingTurnIds` — FIFO queue of `{ turnId, sessionId }` populated by `sendMessage`, consumed on `message_start`. This handles the case where multiple `sendMessage` calls queue before stream events arrive.
- `toolByCallId` — `Map<string, { itemId, toolName, toolArguments, callId }>` for tool output correlation across turns

**State tracked during a turn (reset on terminal):**
- `currentTurnId` — dequeued from `pendingTurnIds` on `message_start`
- `currentModelId` — from `message_start.message.model`
- `messageOrdinal` — incremented per `message_start` within the turn (typically 1)
- `blockStates` — `Map<number, BlockState>` keyed by content block index, tracking accumulated content, type, batching counters, and whether `create` has been emitted
- `isTurnTerminal` — set `true` after emitting `turn_complete` or `turn_error`; prevents duplicate terminal emissions

**Item ID generation:** `${turnId}:${messageOrdinal}:${blockIndex}`

**Event translation rules:**

| SDK Event | Action |
|-----------|--------|
| `message_start` | Dequeue next `{ turnId, sessionId }` from `pendingTurnIds`. If queue is empty, this is a protocol error — emit `TurnEvent { type: "turn_error", turnId: currentTurnId ?? "unknown-turn", sessionId, errorCode: "PROTOCOL_ERROR", errorMessage: "message_start with no pending turn" }`, clear turn-local state (`blockStates`, `messageOrdinal`, `currentModelId`, `currentTurnId`), set `isTurnTerminal = true`, and skip further processing until next `message_start`. Otherwise: emit `TurnEvent { type: "turn_started", turnId, sessionId, modelId: message.model, providerId: "claude-code" }`. Set `currentTurnId`, `messageOrdinal`, `currentModelId`. Reset `isTurnTerminal = false`. |
| `content_block_start` (text) | Initialize buffered block state (see Batching section). Do NOT emit yet — first emission happens when batch threshold is reached. |
| `content_block_start` (thinking) | Initialize buffered block state. Same deferred emission as text. |
| `content_block_start` (tool_use) | Create tool state in `toolByCallId`. Emit `ToolCallUpsert { status: "create", toolName: block.name, callId: block.id, toolArguments: {}, itemId }` immediately (no batching for tools). |
| `content_block_delta` (text_delta) | Accumulate `delta.text` into block state. Check batch threshold — if exceeded, emit `MessageUpsert` with `status: "create"` (first) or `"update"` (subsequent) carrying full accumulated content. |
| `content_block_delta` (thinking_delta) | Accumulate `delta.thinking`. Same batch threshold logic as text. |
| `content_block_delta` (input_json_delta) | Accumulate `delta.partialJson` into tool argument buffer (raw string). No emission. |
| `content_block_stop` (text block) | Flush remaining content if un-emitted, then emit `MessageUpsert { status: "complete", content: <full accumulated> }`. |
| `content_block_stop` (thinking block) | Same flush + complete pattern as text. `ThinkingUpsert { status: "complete" }`. |
| `content_block_stop` (tool_use block) | Parse accumulated JSON into `toolArguments`. On JSON parse failure, fall back to `{}`. Emit `ToolCallUpsert { status: "complete", toolArguments: <parsed or {}> }`. |
| `user_tool_result` | Look up tool by `toolUseId` in `toolByCallId`. If not found, ignore (defensive — avoids crash on unrecognized callId). Otherwise emit `ToolCallUpsert { status: "complete", callId, toolOutput: content, toolOutputIsError: isError }`. |
| `message_delta` | Capture `stopReason` and `usage` for the terminal event. |
| `message_stop` | If `isTurnTerminal`, skip (prevents double emission). Otherwise emit terminal based on `stopReason`: `"error"` → `TurnEvent { type: "turn_error", turnId: currentTurnId ?? "unknown-turn", sessionId, errorCode: "PROCESS_CRASH", errorMessage: "Claude SDK reported stopReason=error" }`; `"end_turn"` or `"tool_use"` → `TurnEvent { type: "turn_complete", status: "completed" }`; `"max_tokens"` or other non-standard reason → `TurnEvent { type: "turn_complete", status: "cancelled" }`. Include usage if available. Set `isTurnTerminal = true`. Clean up turn state (clear blockStates, reset messageOrdinal). |

**Timestamp handling:**
- `sourceTimestamp`: `deps.now()` called when the SDK event is received (before processing)
- `emittedAt`: `deps.now()` called when the upsert/turn event is constructed and about to be emitted
- In red-phase tests, `deps.now` returns a fixed value, so both will be identical. The distinction matters in production where processing takes time.

**Emitting to listeners:**
```typescript
private emitUpsert(sessionId: string, upsert: UpsertObject): void {
  for (const cb of this.upsertListeners.get(sessionId) ?? []) {
    cb(upsert);
  }
}
private emitTurn(sessionId: string, event: TurnEvent): void {
  for (const cb of this.turnListeners.get(sessionId) ?? []) {
    cb(event);
  }
}
```

### Batching (Emission Cadence for Text and Thinking Blocks)

`UpsertObject` uses accumulated content (full state replacement, not deltas). Without batching, every `content_block_delta` would emit the entire accumulated content — O(n²) total bytes for a linear response. Batching controls emission frequency to make the accumulated content model viable.

**Batching applies to `MessageUpsert` and `ThinkingUpsert` only.** `ToolCallUpsert` is emitted immediately on `content_block_start` (create) and `content_block_stop` (complete) — no intermediate emissions, no batching needed, because tool arguments are only useful when finalized.

**Batch gradient thresholds (token counts):** `[10, 20, 40, 80, 120]`

Token counting: whitespace-delimited words (`text.match(/\S+/g)?.length ?? 0`).

**Per-block state for batching:**
```typescript
interface BufferedBlockState {
  // ... existing block tracking fields (content, type, itemId, etc.)
  emittedTokenCount: number;   // tokens already emitted in previous upserts
  batchIndex: number;          // index into gradient array, advances as content grows
  hasEmittedCreate: boolean;   // whether the first "create" upsert has been emitted
}
```

**On `content_block_start` (text/thinking):** Initialize block state with `emittedTokenCount: 0`, `batchIndex: 0`, `hasEmittedCreate: false`. Do NOT emit a `create` upsert yet — wait until enough content accumulates.

**On `content_block_delta` (text_delta/thinking_delta):** Accumulate content. Count tokens. If `(currentTokens - emittedTokenCount) > gradient[batchIndex]`:
1. Emit upsert with `status: hasEmittedCreate ? "update" : "create"` and full accumulated content
2. Set `hasEmittedCreate = true`
3. Update `emittedTokenCount = currentTokens`
4. Advance `batchIndex`: step forward through the gradient based on how many tokens were emitted (see processor's `advanceBatchIndex` for the exact loop)

**On `content_block_stop` (text/thinking):** Flush any remaining buffered content:
1. If there's un-emitted content (tokens > emittedTokenCount), emit with `status: hasEmittedCreate ? "update" : "create"`, then set `hasEmittedCreate = true`
2. Emit final upsert with `status: "complete"` and full accumulated content
3. Clean up block state

**Reference implementation:** `server/streaming/upsert-stream-processor.ts` lines 241-268 (`handleItemDelta`), lines 270-356 (`handleItemDone`), lines 520-529 (`getCurrentBatchThreshold`), lines 531-547 (`advanceBatchIndex`), lines 549-551 (`countBatchTokens`). Adapt these patterns — the logic is the same, the input events are different (SDK events instead of StreamEventEnvelope).

### Error Handling

- If the output stream throws/errors during consumption: emit `TurnEvent { type: "turn_error", turnId: currentTurnId ?? "unknown-turn", sessionId, errorCode: "PROCESS_CRASH", errorMessage }`, mark session as dead, and clear turn-local state
- If `interrupt()` throws: wrap in `ProviderError(INTERRUPT_FAILED)`
- If `close()` throws: swallow (best-effort cleanup)
- `message_delta` with `stopReason: "error"`: emit `TurnEvent { type: "turn_error", turnId, sessionId, errorCode, errorMessage }`, NOT `turn_complete`

## File Changes

### `server/providers/claude/claude-sdk-provider.ts` — IMPLEMENT

This is the only file that should change. Implement all methods that currently throw `NotImplementedError`:
- `createSession`
- `loadSession`
- `sendMessage`
- `cancelTurn`
- `killSession`

Keep `isAlive` as-is (already implemented). Keep `onUpsert`/`onTurn` as-is (already implemented from Pivot-1).

Add internal private methods for:
- Input generator creation
- Output stream consumption loop
- SDK event → upsert/turn translation
- Listener emission helpers

## Non-Goals

- Do NOT modify any test files
- Do NOT modify `provider-types.ts`, `upsert-types.ts`, `provider-errors.ts`, or any other file
- Do NOT implement session history/replay — `loadSession` uses SDK resume semantics
- Do NOT add new dependencies
- Do NOT add WebSocket, pipeline, or browser integration

## Constraints

- Only modify `server/providers/claude/claude-sdk-provider.ts`
- All 14 tests must pass using the existing mock SDK boundary — no real SDK calls
- The mock boundary's `query()` returns a handle with a finite `AsyncIterable<ClaudeSdkStreamEvent>` output. The consumer loop must handle stream completion gracefully.
- The mock boundary's `input` is an `AsyncIterable<string>` created by the provider. Tests read from it directly via `request.input[Symbol.asyncIterator]()`.
- Respect the test's `createProvider()` deps: `createSessionId` returns `"claude-session-001"`, `createTurnId` returns `"turn-1"`, `"turn-2"`, etc. (incrementing counter), `now` returns a fixed timestamp.

## If Blocked or Uncertain

- If a test expectation seems inconsistent with this spec, implement to match the test — the tests are the contract
- If the mock SDK boundary doesn't emit events in a sequence you expect, trace the test's `createMockSdkBoundary()` call to see exactly what events are fed in
- If you need to add a helper type or private interface inside the provider file, that's fine
- Do NOT modify tests. If a test seems wrong, report it but implement to pass it anyway.

## Verification

When complete, run in this order:

1. `bun run red-verify` — must pass (format + lint + typecheck)
2. `bunx vitest run tests/server/providers/claude-sdk-provider.test.ts` — all 14 Story 4 tests pass
3. `bunx vitest run tests/server/providers/provider-interface.test.ts` — TC-2.1a and TC-2.1b pass
4. `bunx vitest run tests/server/streaming/upsert-stream-processor.test.ts` — Story 2 processor tests still pass (no regression)
5. `bunx vitest run tests/server/contracts/` — Story 0 contract tests still pass
6. `bunx vitest run tests/server/websocket.test.ts` — Story 1 WS tests still pass

**Note on test baseline:** Three test suites are intentionally red from Story 3 stubs (provider-registry, session-routes) and were red before this work. Do NOT attempt to fix those — they are out of scope. The 9 previously-passing suites (92 tests) must remain green.

If `bun run green-verify` is available, run that as well — it includes a guard that confirms no test files were modified.

## Done When

- [ ] All 14 tests in `claude-sdk-provider.test.ts` pass
- [ ] TC-2.1a and TC-2.1b in `provider-interface.test.ts` pass
- [ ] No test files modified
- [ ] `bun run red-verify` passes (format, lint, typecheck)
- [ ] 9 previously-passing test suites (92 tests) remain green — no regressions
- [ ] Only `server/providers/claude/claude-sdk-provider.ts` was modified

## Handoff Output Contract

Return:
- File changed (should be exactly one)
- Test pass count (should be 14/14 for Story 4 + TC-2.1a/b)
- Full suite results (pass/fail counts)
- Any deviations from spec or judgment calls made
- Any test assertions that required interpretation
